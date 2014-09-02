var booksitesApp = angular.module('booksitesApp', ['ngRoute', 'booksitesAppControllers', 'parse-angular', 'parse-angular.enhance']);

booksitesApp.config(['$routeProvider',
  function($routeProvider) {
    $routeProvider.
      when('/jobResults', {
        templateUrl: 'partials/jobResult-list.html',
        controller: 'JobResultListCtrl'
      }).
      when('/jobResults/:jobResultId', {
        templateUrl: 'partials/jobResult-detail.html',
        controller: 'JobResultDetailCtrl'
      }).
      otherwise({
        redirectTo: '/jobResults'
      });
  }]);

booksitesApp.directive('objectAsList', function() {
	return {
		scope: {
			object : '='
		}, 
		restrict: 'E',
		replace: 'true',
		templateUrl: 'directives/objectAsList.html',
	    link: function(scope, elem, attrs) {
			elem.bind('click', function() {
				scope.$apply(function() {
					scope.showInfo = !scope.showInfo;
				});
				return false;
			});		
		}
	}
});