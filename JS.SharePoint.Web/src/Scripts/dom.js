var dom = (function () {

    var matchesMethod = null;

    function dom(element) {
        if (typeof element === 'string')
            return new Dom(document.createElement(element));

        return new Dom(element);
    }

    dom.selectAll = document.querySelectorAll.bind(document);
    dom.select = document.querySelector.bind(document);
    dom.byId = document.getElementById.bind(document);
    Object.defineProperty(dom, "matches", {
        get: function () {
            if (!matchesMethod) {
                var e = document.createElement("div");
                matchesMethod = e.matches ||
                                e.webkitMatchesSelector ||
                                e.mozMatchesSelector ||
                                e.msMatchesSelector ||
                                e.oMatchesSelector;
            }

            return matchesMethod;
        }
    });

    function Dom(element) {
        this._element = element;
    }

    Dom.prototype = {
        get element() {
            return this._element;
        },
        parents: function (selector) {
            var parents = [];
            var foundElements = dom.selectAll(selector);
            for (var x = 0; x < foundElements.length; x++) {
                if (foundElements[x].contains(this._element))
                    parents.push(foundElements[x]);
            }
            return parents;
        },
        parent: function (selector) {
            var parent = null
            var foundElements = dom.selectAll(selector);
            for (var x = 0; x < foundElements.length && !parent; x++) {
                if (foundElements[x].contains(this._element))
                    parent = foundElements[x];
            }
            return parent;
        },
        select: function(selector) {
            return this._element.querySelector(selector);
        },
        selectAll: function(selector) {
            return this._element.querySelectorAll(selector);
        },
        children: function(selector) {
            var ret = [];
            var nodes = this._element.childNodes;
            for (var x = 0; x < nodes.length; x++) {
                if (dom(nodes[x]).matches(selector))
                    ret.push(nodes[x]);
            }
            return ret;
        },
        matches: function (selector) {
            if (this._element.nodeType === Node.ELEMENT_NODE)
                return dom.matches.call(this._element, selector);

            return false;
        },
        insertBefore: function (element) {
            element.parentElement.insertBefore(this._element, element);
            return this;
        }
    };

    return dom;
})();