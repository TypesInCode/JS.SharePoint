//! require("deferred")

var cachedb = (function () {

    function processQueue(queue, args) {
        while (queue.length > 0)
            queue.pop().apply(null, args);
    }

    function getItem(db, store, key) {
        var def = new deferred();

        var req = db.transaction(store).objectStore(store).get(key);
        req.onsuccess = function (e) {
            def.resolve(e.target.result);
        };

        req.onerror = function (e) {
            def.reject(e);
        };

        return def.promise();
    }

    function setItem(db, store, object) {
        var def = new deferred();

        var req = db.transaction([store], "readwrite").objectStore(store).put(object);
        req.onsuccess = function (e) {
            def.resolve();
        };

        req.onerror = function (e) {
            def.reject(e);
        };

        return def.promise();
    }

    function CacheDB(datastoreName, seconds, minutes, hours, days) {
        this._datastoreName = datastoreName;
        this._seconds = seconds || 0;
        this._minutes = minutes || 0;
        this._hours = hours || 0;
        this._days = days || 0;

        this._queue = [];
        this._initialized = false;
        this._initializing = false;

        this._db = null;
    }

    CacheDB.prototype = {
        get expiresOffset() {
            return this._seconds * 1000 + this._minutes * 60 * 1000 +
                this._hours * 60 * 60 * 1000 + this._days * 24 * 60 * 60 * 1000;
        },
        get expires() {
            var d = new Date();
            return new Date(d.getTime() - this.expiresOffset);
        },
        init: function() {
            if (this._initializing)
                return;

            this._initializing = true;
            var self = this;
            var req = indexedDB.open(this._datastoreName, 1);
            req.onerror = function (e) {
                console.error(e);
            };
            req.onsuccess = function (e) {
                self._db = e.target.result;
                self._initialized = true;
                processQueue(self._queue);
            };
            req.onupgradeneeded = function () {
                var db = req.result;
                db.createObjectStore(self._datastoreName, { keyPath: "key" });
            };
        },
        enqueue: function (callback) {
            this._queue.push(callback);
            if (!this._initialized)
                this.init();
            else
                processQueue(this._queue);
        },
        get: function (key, refreshCallback) {
            var def = new deferred();

            var self = this;
            this.enqueue(function () {
                getItem(self._db, self._datastoreName, key).done(function (data) {

                    if (!data || data.dateAdded < self.expires) {
                        if (refreshCallback) {
                            refreshCallback(function (value) {
                                self.put(key, value).done(function () {
                                    def.resolve(value);
                                }).fail(function (e) {
                                    console.error(e);
                                });
                            });
                        }
                        else
                            def.resolve(null);
                    }
                    else
                        def.resolve(data.value);
                    
                }).fail(function (e) {
                    console.error(e);
                });
            });

            return def.promise();
        },
        put: function (key, data) {
            var def = new deferred();

            var object = {
                key: key,
                dateAdded: new Date(),
                value: data
            };

            var self = this;
            this.enqueue(function () {
                setItem(self._db, self._datastoreName, object)
                    .done(def.resolve.bind(def))
                    .fail(def.reject.bind(def));
            });

            return def.promise();
        },
        clear: function () {
            indexedDB.deleteDatabase(this._datastoreName);
            this._initialized = false;
            this._initializing = false;
        }
    };

    var cachedb = new CacheDB("cache-db", 0, 2);
    cachedb.CacheDB = CacheDB;
    return cachedb;

})();