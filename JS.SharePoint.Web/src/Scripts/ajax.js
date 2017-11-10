//! require("deferred")

var ajax = (function () {

    var protocolMatch = /^https?:/i;
    function enforceProtocol(url) {
        var hostRgx = new RegExp(window.location.host, "i");
        if (!url.match(hostRgx))
            return url;

        var protRgx = new RegExp("^" + window.location.protocol, "i");
        if (url.match(protRgx))
            return url;

        return url.replace(protocolMatch, window.location.protocol);
    }

    function ajax(options) {
        if (!options.method)
            throw "options.method property is required";
        if (!options.url)
            throw "options.url property is required";

        var http = new XMLHttpRequest();
        http.open(options.method, enforceProtocol(options.url));

        for (var key in options.headers) {
            http.setRequestHeader(key, options.headers[key]);
        }

        var def = new deferred();
        http.onreadystatechange = function () {
            if (http.readyState === XMLHttpRequest.DONE) {
                if (200 <= http.status && http.status < 300) {
                    def.resolve(http.responseText);
                }
                else {
                    def.reject(http.status);
                }
            }
        }
        http.send(options.data);
        return def.promise();
    };

    ajax.get = function (url, headers) {
        headers["Accept"] = headers["Accept"] || "text/plain";
        return ajax({
            url: url,
            method: "GET",
            headers: headers
        });
    };

    ajax.getJSON = function (url, accept, headers) {
        headers = headers || {};
        var def = new deferred();
        headers["Accept"] = accept || "application/json";
        ajax.get(url, headers).done(function (data) {
            var obj = JSON.parse(data);
            def.resolve(obj);
        }).fail(def.reject.bind(def));
        return def.promise();
    };

    ajax.post = function (url, data, headers) {
        headers = headers || {};
        headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded";
        return ajax({
            url: url,
            method: "POST",
            data: data,
            headers: headers
        });
    };

    ajax.postJSON = function (url, data, accept, headers) {
        data = data || {};
        headers = headers || {};
        var def = new deferred();
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        headers["Accept"] = accept || "application/json";
        ajax.post(url, JSON.stringify(data), headers).done(function (data) {
            var obj = null;
            try {
                obj = JSON.parse(data);
            }
            catch(err) { }
            def.resolve(obj);
        }).fail(def.reject.bind(def));
        return def.promise();
    };

    return ajax;
})();