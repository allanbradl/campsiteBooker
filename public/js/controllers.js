var booksitesAppControllers = angular.module('booksitesAppControllers', []);

booksitesAppControllers.factory('ParseObjectFactory', function() {
	return {
		buildJobResult : function() {
			return Parse.Object.extend({
				className: "JobResult",
				attrs: ['message', 'error'],
				getShortMessage : function() {
					if (this.get("message")) {
						return this.get("message").substring(0,100);
					} else {
						return this.get("message");				
					}
				}
			});
		},
		buildResponseText : function() {
			return Parse.Object.extend("ResponseText");
		}
	}
});

booksitesAppControllers.controller('JobResultListCtrl', ['$scope', 'ParseObjectFactory', function ($scope, ParseObjectFactory) {
	var query = new Parse.Query(ParseObjectFactory.buildJobResult());
	query.descending("createdAt");
	query.limit(20);
	query.find({
		success:function(results) {
			$scope.jobResults = results;
		},
		error:function(error) {
			console.error("Error: " + error.code + " " + error.message);
		}		
	});
}]);

booksitesAppControllers.controller('JobResultDetailCtrl', ['$scope', '$routeParams', 'ParseObjectFactory', 
	function ($scope, $routeParams, ParseObjectFactory) {
		var fetchResponseTime = function(textId, stateName) {
			var ResponseText = ParseObjectFactory.buildResponseText();
			var query2 = new Parse.Query(ResponseText);
			query2.get(textId, {
				success:function(responseText) {
					$scope.createdDates = $scope.createdDates || {};
					$scope.createdDates[stateName] = responseText.createdAt;
			}});
		}
		var query = new Parse.Query(ParseObjectFactory.buildJobResult());
		query.get($routeParams.jobResultId, {
			success:function(jobResult) {
				$scope.jobResult = jobResult;
				for(var i = 0 ; i < jobResult.get("states").length; i++) {
					var state = jobResult.get("states")[i];
					if (state.response && state.response.textId) {
						var textId = state.response.textId;
						fetchResponseTime(textId, state.name);
					}
				}
			},
			error:function(obj, msg) {
				console.error(msg);
			}
		})
	}]);