//! require("sp")
//! require("deferred")

var SPListCache = (function () {

    function SPListCache(restOptions, listName, readOnlyProps) {
        this.restOptions = restOptions;
        this.listName = listName;
        this.readOnlyProperties = readOnlyProps;
        this.data = null;
        this.dataDeferred = null;
    }

    SPListCache.prototype = {
        get restType() {
            return "SP.Data." + this.listName.replace(/\s/g, "_x0020_") + "ListItem";
        },
        get all() {
            if (this.data)
                return deferred.resolved(this.data);

            if (this.dataDeferred)
                return this.dataDeferred.promise();

            this.dataDeferred = new deferred();
            var self = this;
            sp.rest(this.restOptions).web.list(this.listName).items.data.done(function (data) {
                self.data = data.d.results;
                self.dataDeferred.resolve(self.data);
                self.dataDeferred = null;
            });

            return this.dataDeferred.promise();
        },
        filter: function (filterFunc, refresh) {
            if (refresh)
                this.data = null;

            var def = new deferred();
            var self = this;
            this.all.done(function (data) {
                var filteredData = data.reduce(function (pre, c) {
                    if (filterFunc(c))
                        pre.push(c);

                    return pre;
                }, []);
                def.resolve(filteredData);
            });
            return def.promise();
        },
        first: function (filterFunc, refresh) {
            if (refresh)
                this.data = null;

            var def = new deferred();
            this.all.done(function (data) {
                for (var x = 0; x < data.length && !filterFunc(data[x]) ; x++) { }
                def.resolve(data[x] || null);
            });
            return def.promise();
        },
        create: function (item) {
            var def = new deferred();
            item.__metadata = { type: this.restType };
            var self = this;
            sp.rest({ $select: "Id" }).web.list(this.listName).items.add(item).done(function (newItem) {
                sp.rest({ $select: self.restOptions.$select, $expand: self.restOptions.$expand }).web.list(self.listName).item(newItem.d.Id).data.done(function (item) {
                    self.data.push(item.d);
                    def.resolve(item.d);
                });
            }).fail(def.reject.bind(def));
            return def.promise();
        },
        update: function (item, forceColumns) {
            forceColumns = forceColumns || [];
            var def = new deferred();
            var self = this;
            var obj = JSON.parse(JSON.stringify(item));
            for (var x = 0; x < this.readOnlyProperties.length; x++) {
                delete obj[this.readOnlyProperties[x]];
            }
            for (var y = 0; y < forceColumns.length; y++) {
                obj[forceColumns[y]] = item[forceColumns[y]];
            }
            sp.mergeJSON(item.__metadata.uri, obj).done(function () {
                var x = 0;
                for ( ; x < self.data.length && item.Id != self.data[x].Id; x++) { }
                self.data[x] = item;
                def.resolve();
            }).fail(def.reject.bind(def));
            return def.promise();
        },
        delete: function(item) {
            var def = new deferred();
            var self = this;
            sp.delete(item.__metadata.uri).done(function () {
                var x = 0;
                for (; x < self.data.length && item.Id != self.data[x].Id; x++) { }
                self.data.splice(x, 1);
                def.resolve();
            }).fail(def.reject.bind(def));
            return def.promise();
        }
    }

    return SPListCache;

})();