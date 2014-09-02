function parseQueryString(qs) {
	var match,
		pl     = /\+/g,  // Regex for replacing addition symbol with a space
		search = /([^&=]+)=?([^&]*)/g,
		decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
		query  = qs || window.location.search.substring(1);

	var urlParams = {};
	while (match = search.exec(query)) {
		urlParams[decode(match[1])] = decode(match[2]);
	}
	return urlParams;
};
function render(obj) {
	if (obj instanceof String || obj instanceof Number) {
		return obj;
	} else {
		return JSON.stringify(obj);
	}
}
function toHtmlList(obj, id) {
	if (!obj) return '';
	var str = ' <a href="#" onclick="$(\'#'+id+'\').toggle();return false;">toggle</a><ul id="'+id+'" style="display:none">';
	for(var prop in obj) {
		str += '<li>'+prop+'='+render(obj[prop])+'</li>';
	}
	str += '</ul>';
	return str;
}
