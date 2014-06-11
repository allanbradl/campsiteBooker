var moment = require('moment');

function StateMachine(user, reserveJob, status) {
	this.user = user;
	this.reserveJob = reserveJob;
	this.status = status;
	this.currentState = null;
	this.jsessionid = null;
	this.processNextState = function(newState, extractedData) {
		extractedData = extractedData || {};
		this.currentState = newState;
		var stateData = this.getStateData();
		var args = {
			method:'POST'
		};
		args.url = extractedData.url || stateData.url;
		args.body = this.combine(extractedData.body, stateData.body);
		if (this.jsessionid) {
			args.headers = {
				'Cookie':'JSESSIONID='+this.jsessionid
			}
		}
		args.success = this.wrapWithLogger(stateData.success);
		args.error = this.wrapWithLogger(stateData.error || this.defaultErrorHandler);
		this.logRequest(args, function() { Parse.Cloud.httpRequest(args); });
	};
	this.wrapWithLogger = function(handler) {
		var that = this;
		return function(httpResponse) {
			that.logResponse(httpResponse, handler);
		}
	};
	this.logResponse = function(httpResponse, success) {
		var that = this;
		var jobResult = this.getJobResult();
		var states = jobResult.get("states");
		var state = that.getLogState(states);
		state.response.headers = httpResponse.headers;
		var ResponseText = Parse.Object.extend("ResponseText");
		var text = httpResponse.text;
		// make it more readable.
		text = replaceAll(text, "url('", "url('http://www.recreation.gov");
		text = replaceAll(text, 'src="', 'src="http://www.recreation.gov');
		text = replaceAll(text, "src='", "src='http://www.recreation.gov");
		(new ResponseText()).save({text:text}, {
			success:function(responseText) {
				state.response.textId = responseText.id;
				state.response.cookies = httpResponse.cookies;
				jobResult.save({}, {
					success:function() {
						success(httpResponse);
					},
					error: function(obj, error) {
						that.status.error("unable save response "+JSON.stringify(error));
					}
				});					
			},
			error: function(obj, error) {
				that.status.error("unable save response text "+JSON.stringify(error));
			}
		})
	};
	this.getLogState = function(states) {
		for(var i = 0; i < states.length; i++) {
			var state = states[i];
			if (state.name == this.currentState) {
				return state;
			}
		}
		var state = {};
		state.name = this.currentState;
		state.request = {};
		state.response = {};
		states.push(state);
		return state;
	}
	this.getJobResult = function() {
		var that = this;
		if (!that.jobResult) {
			var JobResult = Parse.Object.extend("JobResult");
			that.jobResult = new JobResult();
		}
		var states = that.jobResult.get("states") || [];
		var state = that.getLogState(states);
		that.jobResult.set("states", states);
		return that.jobResult;
	}
	this.logRequest = function(args, success) {
		var that = this;
		var jobResult = that.getJobResult();
		var states = jobResult.get("states");
		var state = that.getLogState(states);
		state.request.url = args.url;
		state.request.header = args.header;
		state.request.body = args.body;
		jobResult.save({}, {
			success:function(savedJob) {
				that.reserveJob.set("bookAttempted", true);
				that.reserveJob.set("jobResult", savedJob);	
				that.reserveJob.save({}, {
					success:function(savedJob) {
						success();
					},
					error: function(obj, error) {
						that.status.error("unable save request "+JSON.stringify(error));
					}
				});
			},
			error: function(obj, error) {
				that.status.error("unable save request "+JSON.stringify(error));
			}
		});
	}
	this.defaultErrorHandler = function(httpResponse) {
		this.error("Request failed with response code " + httpResponse.status);
	};
	this.error = function(msg) {
		var that = this;
		var errorMsg = this.currentState+": "+msg;
		var jobResult = this.getJobResult();
		jobResult.set("error", true);
		jobResult.set("message", errorMsg);
		jobResult.save({}, {
			success:function() {
				that.status.error(errorMsg);				
			},
			error: function(obj, error) {
				that.status.error("unable save error: "+errorMsg);
			}
		});
	};
	this.success = function(msg) {
		var that = this;
		var jobResult = this.getJobResult();
		jobResult.set("error", false);
		jobResult.set("message", msg);
		jobResult.save({}, {
			success:function() {
				that.status.success(msg);				
			},
			error: function(obj, error) {
				that.status.error("unable save success: "+msg);
			}
		});
	};
	this.getStateData = function() {
		return this['get'+this.currentState+'StateData']();
	};
	this.getLoginStateData = function() {
		var that = this;
		return {
			url:'https://www.recreation.gov/memberSignInSignUp.do',
			body: {
				AemailGroup_1733152645:that.user.get("accounts")['recreation'].username,
				ApasswrdGroup_704558654:that.user.get("accounts")['recreation'].password,
				submitForm:'submitForm',
				signinFromPurchaseFlow:'1',
				sbmtCtrl:'combinedFlowSignInKit'
			},
			success:function(httpResponse) {
				if (httpResponse.text.indexOf('Please verify')!=-1) {
					that.error("Login failed. invalid username/password");
					return;				
				}
				var cookies = httpResponse.headers['Set-Cookie'];
				if (!httpResponse.cookies || 
					!httpResponse.cookies.JSESSIONID ||
					!httpResponse.cookies.JSESSIONID.value) {
					that.error("Login failed. unable to get JSESSIONID from cookies "+httpResponse.cookies);
					return;
				}
				that.jsessionid = httpResponse.cookies.JSESSIONID.value;
				that.processNextState('CheckAvailability1');
			}
		}
	};
	this.getCheckAvailability1StateData = function() {
		var that = this;
		var formattedCampingDate = moment(that.reserveJob.get("campingDate")).format('ddd MMM DD YYYY');
		return {
			url: 'http://www.recreation.gov/campsiteCalendar.do',
			body: {
				page:'calendar',
				contractCode:'NRSO',
				siteTypeFilter:'ALL',
				submitSiteForm:'true',
				search:'site',
				currentMaximumWindow:'12',
				parkId:that.reserveJob.get("parkId"),
				campingDate:formattedCampingDate,
				lengthOfStay:that.reserveJob.get("lengthOfStay"), 
				lookingFor:that.reserveJob.get("lookingFor")
			},
			success:function(httpResponse) {
				// we need to call this page twice but wait until booking window is open.
				pause(that.reserveJob.get("timeToBook"), 
					  function() { that.processNextState('CheckAvailability2'); });
			}
		}
	};
	this.getCheckAvailability2StateData = function() {
		var that = this;
		//same data. different success function.
		var stateData = that.getCheckAvailability1StateData();
		stateData.success = function(httpResponse) {
			var r=parseCampsiteResults(httpResponse.text);
			if (!r.canBook) {
				that.error(r.parseError);
				return;
			}
			that.processNextState('CampsiteDetail', {
				url:'http://www.recreation.gov'+r.bookUrl,
				body:r.bookParams
			});
		}
		return stateData;
	};
	this.getCampsiteDetailStateData = function() {
		var that = this;
	    return {
			success:function(httpResponse) {
				var text = httpResponse.text;
				var expectedParams = ['contractCode', 'parkId', 'siteId', 'camparea', 'selStatus',
					'dateToday', 'currentMaximumWindow', 'dateMinWindow', 'dateMaxWindow', 'arrivaldate', 
					'lengthOfStay', 'dateChosen'];
				var params = {
					matrixHasError:false
				};
				for (var i = 0; i < expectedParams.length; i++) {
					var param = expectedParams[i];
					var value = getFormValue(text, param);
					if (value == null) {
						that.error("campsiteDetail: Unable to find form value for "+param);
						return;
					}
					params[param] = value;
				}
				params['arvdate'] = moment(new Date(params.arrivaldate)).format('MM/DD/YYYY');
				that.processNextState('SwitchBookingAction', {
					body:params
				});
			}
		};
	}
	this.getSwitchBookingActionStateData = function() {
		var that = this;
	    return {
			url: 'http://www.recreation.gov/switchBookingAction.do',
			success:function(httpResponse) {
				var text = httpResponse.text;
				var msg = "HTTP 200";
				var i1 = text.indexOf("id='msg1'>");
				if (i1!=-1) {
					var i2 = text.indexOf("</div>", i1)
					if (i2 != -1) {
						msg = text.substring(i1+10, i2);
					}
				}
				that.error("switchBookingAction: should have recieved redirect. instead got "+msg);
			},
			error: function(httpResponse) {
				if (httpResponse.status == 302) {
					// correctly got redirect.
					var url = httpResponse.headers.Location;
					that.processNextState('ReservationDetails', {
						url:url
					});
					return;
				}
				that.error("switchBookingAction: failed. Request failed with response code " + httpResponse.status);
			}
		};
	}
	this.getReservationDetailsStateData = function() {
		var that = this;
	    return {
			success:function(httpResponse) {
				var params = {
					firstViewFlag:true,
					equipmentType:108060,
					numberOfCampers:6,
					numberOfVehicles:2,
					primaryOccupant:'Member',
					InteragencyAnnualPassStandardDelivery:0,
					InteragencyAnnualPassStandardDelivery_fixedPrice:'Y',
					agreementAccepted:'true'
				}; 
				if (that.reserveJob.get("lookingFor") == '9001') {
					// day use sites don't have equiment.
					params.equipmentType = 0;
				}
				var expectedParams = ['cartItemId', 'contractCode'];
				for (var i = 0; i < expectedParams.length; i++) {
					var param = expectedParams[i];
					var value = getFormValue(httpResponse.text, param);
					if (value == null) {
						that.error("Unable to find form value for "+param);
						return;
					}
					params[param] = value;
				}
				var emptyParams = [
					'vehicleLength','equipmentDepth','firstName','lastName','streetAddressLine1',
					'city','stateProvince','zipCode','country','phoneNumber','emailAddress1',
					'cpassnum_701','cpassexpdate_701','cpasshldname_701','cpassnum_702','cpassexpdate_702',
					'cpasshldname_702'
				];
				for (var i = 0; i < emptyParams.length; i++) {
					params[emptyParams[i]] = '';
				}
				that.processNextState('UpdateShoppingCart', {
					body:params
				});
			}
		};
	}
	this.getUpdateShoppingCartStateData = function() {
		var that = this;
	    return {
			url: 'https://www.recreation.gov/updateShoppingCartItem.do',
			success:function(httpResponse) {
				if (httpResponse.text.indexOf('Items In Cart: 1')==-1) {
					that.error('failed to find string "Items In Cart: 1"');
					return;			
				}
				that.processNextState('CheckoutShoppingCart');
			}
		};
	}

	this.getCheckoutShoppingCartStateData = function() {
		var that = this;
	    return {
			url: 'https://www.recreation.gov/checkoutShoppingCart.do',
			success:function(httpResponse) {
				var params = {
				};
				var expectedParams = ['swiped', 'paymentAmountChoice', 'postalCodeNotApplicable', 'postalCodeApplicableFlag', 
					'postalCodeRequiredCheckbox'];
				for (var i = 0; i < expectedParams.length; i++) {
					var param = expectedParams[i];
					var value = getFormValue(httpResponse.text, param);
					if (value == null) {
						that.error("Unable to find form value for "+param);
						return;
					}
					params[param] = value;
				}
				var emptyParams = [
					'swipeData','giftCardNumber','giftCardSecCode','giftCardType','postalCode','voucherNumberHid',
					'giftCardNumberHid','redeemContract','redeemContractIndex','redeemOperation'
				];
				for (var i = 0; i < emptyParams.length; i++) {
					params[emptyParams[i]] = '';
				}
				that.processNextState('ProcessCart', {
					body:params
				});
			}
		};
	}
	this.getProcessCartStateData = function() {
		var that = this;
	    return {
			url: 'https://www.recreation.gov/processCart.do',
			body: {
				cardType:that.user.get("creditCard").cardType,
				cardNumber:that.user.get("creditCard").cardNumber,
				securityCode:that.user.get("creditCard").securityCode,
				expMonth:that.user.get("creditCard").expMonth,
				expYear:that.user.get("creditCard").expYear,
				firstName:that.user.get("creditCard").firstName,
				lastName:that.user.get("creditCard").lastName,
				acknowlegeAccepted:true
			},
			success:function(httpResponse) {
				if (httpResponse.text.indexOf('We need you to correct or provide more information')!=-1) {
					that.error("Error processing credit card.");
					return;
				}
				that.success('Booked campsite!'); 
			}
		};		
	}
	
	this.combine = function(high, low) {
		var newObj = {};
		for (var p in low) {
			newObj[p] = low[p];
		}
		for (var p in high) {
			newObj[p] = high[p];
		}
		return newObj;
	};
}

function pause(pauseUntil, finished) {
	var f = 'MMMM Do YYYY, h:mm:ss a';
	var now = new Date();
	var pauseTime = pauseUntil.getTime() - now.getTime();
	if (pauseTime > 0) {
		console.log('currently ' + moment(now).format(f) + ' awake time is ' + moment(pauseUntil).format(f) + ' pausing for '+pauseTime+' ms');
		pausecomp(pauseTime);
		console.log('awake at: '+moment(new Date()).format(f));
		finished();
	} else {
		console.log('currently ' + moment(now).format(f) + ' awake time is ' + moment(pauseUntil).format(f) + ' not pausing');
		finished();
	}
}

// wow this is painful.
function pausecomp(ms) {
	ms += new Date().getTime();
	while (new Date() < ms){};
} 

function parseCampsiteResults(txt) {
  var r = {
	  canBook:false, 
	  parseError:""
  }
	  var shopStart = txt.indexOf("id='shoppingitems'");
  if (shopStart == -1) {
	  r.parseError = "Unable to find shoppingitems table";
	  return r;
  }
  var shopEnd = txt.indexOf("</table>", shopStart);
  if (shopEnd == -1) {
	  r.parseError = "Unable to find shoppingitems table";
	  return r;
  }
  var shopTable = txt.substring(shopStart, shopEnd);
  var bodyStart = shopTable.indexOf("<tbody>");
  if (bodyStart == -1) {
	  r.parseError = "Unable to find start of table body";
	  return r;
  }
  var shopBody = shopTable.substring(bodyStart, shopTable.length);
  if (shopBody.indexOf("<tr") == -1) {
	  r.parseError = "no rows in table body";
	  return r;	  	
  }
  var firstRow = shopBody.split("<tr")[1];
  var columns = firstRow.split("<td");
  if (columns.length != 8) {
	  r.parseError = "wrong number of columns in first row of table: "+columns.length;
	  return r;	  	
  }
  var data = columns[7];
  if (data.indexOf("See Details")==-1) {
	  r.parseError = "Unable to find avialable campsite on given dates. data does not contain book now: " + data;
	  return r;
  }
  var urlStart = data.indexOf("<a href='");
  if (urlStart==-1) {
	  r.parseError = "no in href data: " + data;
	  return r;
  }
  var urlEnd = data.indexOf("'", urlStart+9)
  if (urlEnd==-1) {
	  r.parseError = "no end href in data: " + data;
	  return r;
  }
  var urlWithParams = data.substring(urlStart+9, urlEnd);
  var urlParts = urlWithParams.split('?');
  if (urlParts.length!=2) {
	  r.parseError = "no '?' in url "+urlWithParams;
	  return r;
  }  
  r.canBook = true;
  r.bookUrl = urlParts[0];
  r.bookParams = parseQueryString(urlParts[1].split("&amp;").join("&"));
  return r;
}

function getFormValue(html, name) {
    var r = new RegExp("<input[^>]*value='([^']*)'[^>]*name='"+name+"'[^>]*\\/>");
    var arr = r.exec(html);
	if (arr == null) {
		return null;
	} else {
		return arr[1];
	}
}


function replaceAll(text, str1, str2, ignore)
{
   return text.replace(new RegExp(str1.replace(/([\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g, function(c){return "\\" + c;}), "g"+(ignore?"i":"")), str2);
};

function parseQueryString(qs) {
	var match,
		pl     = /\+/g,  // Regex for replacing addition symbol with a space
		search = /([^&=]+)=?([^&]*)/g,
		decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
		query  = qs;

	var urlParams = {};
	while (match = search.exec(query)) {
		urlParams[decode(match[1])] = decode(match[2]);
	}
	return urlParams;
};

exports.StateMachine = StateMachine;