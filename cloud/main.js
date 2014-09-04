/* Things todo
 *) change front end to use angularJS
 *) make for for reserveamerica.com and reserve angel island
 *) (mobile) front end for inputing reserveJobs
 *) user auth
 *) logging with screen captures (https://www.thumbalizr.com)
 *) more accurate start time
 *) count jobs and return status based on count.
 *) figure out how to scale at peak.

*/

var SM = require('cloud/StateMachine.js');

Parse.Cloud.job("booksites", function(request, status) {
/*	var headers = {};
	headers['User-Agent']='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36';
	//headers['Content-Type']='application/x-www-form-urlencoded';
	Parse.Cloud.httpRequest({
			url:'https://www.reserveamerica.com/memberSignInSignUp.do',
			headers:headers,			
			body: {
				AemailGroup_1733152645:'jessehull@gmail.com',
				ApasswrdGroup_704558654:'flyfly',
				submitForm:'submitForm',
				signinFromPurchaseFlow:'1',
				sbmtCtrl:'combinedFlowSignInKit'
			},
			success:function(httpResponse) {
				console.log('worked');
			},
			error:function(httpResponse) {
				console.log('failed with error code '+httpResponse.status);
			}
		}); */
	var ReserveJob = Parse.Object.extend("ReserveJob");
	var query = new Parse.Query(ReserveJob);
	query.equalTo("bookAttempted", false);
	var nowPlus10Minutes = new Date((new Date().getTime())+1000*60*10)
	query.lessThan("timeToBook", nowPlus10Minutes);
	query.find({
		success: function(results) {
			for (var i = 0; i < results.length; i++) { 
				var reserveJob = results[i];
				reserveJob.get("user").fetch({
					success: function(user) {
						var sm = new SM.StateMachine(user, reserveJob, status);
						sm.processNextState('Login');
					},
					error: function(error) {
						status.error("Error: " + error.code + " " + error.message);
				  	}					
				});
			}
		},
		error: function(error) {
			status.error("Error: " + error.code + " " + error.message);
	  	}
  	});
});

