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

