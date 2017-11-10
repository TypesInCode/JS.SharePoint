var deferred = (function () {

    var state = {
        pending: 0,
        fulfilled: 1,
        rejected: 2
    };

    function processCallbackQueue(queue, arguments) {
        while (queue.length > 0) {
            var callback = queue.pop();
            callback.apply(null, arguments);
        }
    }

    function waitForPromises(arr, def) {
        var result = new Array(arr.length);
        var error = new Array(arr.length);
        var hasError = false;
        var count = 0;
        var def = new Deferred();

        arr.forEach(function (c, i) {
            c.done(function () {
                count++;
                var values = Array.prototype.slice.call(arguments);
                if (values.length === 1)
                    values = values[0];

                result[i] = values;
                if (count === arr.length) {
                    if (hasError)
                        def.reject.apply(def, error);
                    else
                        def.resolve.apply(def, result);
                }
            }).fail(function () {
                hasError = true;
                count++;
                var values = Array.prototype.slice.call(arguments);
                if (values.length === 1)
                    values = values[0];

                error[i] = values;
                if (count === arr.length)
                    def.reject.apply(def, error);
            });
        });

        return def.promise();
    }

    function processMethodSequence(methodArray, continueOnFailure, def, result) {
        result = result || [];
        def = def || new Deferred();

        if (methodArray.length > 0) {
            var promise = methodArray[0]();
            promise.done(function () {
                var values = Array.prototype.slice.call(arguments);
                result.push(values);
                processMethodSequence(methodArray.slice(1), continueOnFailure, def, result);
            }).fail(function () {
                if (continueOnFailure) {
                    var values = Array.prototype.slice.call(arguments);
                    result.push(values);
                    processMethodSequence(methodArray.slice(1), continueOnFailure, def, result);
                }
                else {
                    def.reject.apply(def, arguments);
                }
            });
        }
        else {
            def.resolve.apply(def, result);
        }

        return def.promise();
    }

    function Deferred() {
        this.state = state.pending;
        this.successQueue = [];
        this.failureQueue = [];
        this.value = null;
    }

    Deferred.all = function (promiseArray) {
        return waitForPromises(Array.prototype.slice.call(promiseArray));
    };

    Deferred.sequence = function (methodArray) {
        return processMethodSequence(methodArray);
    };

    Deferred.resolved = function (value) {
        var def = new Deferred();
        def.resolve(value);
        return def.promise();
    };

    Deferred.prototype = {
        resolve: function () {
            if (this.state === state.pending) {
                if (arguments.length === 1 && arguments[0] && arguments[0].isPromise) {
                    arguments[0].done(this.resolve.bind(this));
                    return;
                }
                this.value = Array.prototype.slice.call(arguments);
                processCallbackQueue(this.successQueue, this.value);
                this.state = state.fulfilled;
            }
            else {
                throw "Deferred already resolved/rejected";
            }
        },
        reject: function () {
            if (this.state === state.pending) {
                this.value = Array.prototype.slice.call(arguments);
                processCallbackQueue(this.failureQueue, this.value);
                this.state = state.rejected;
            }
            else {
                throw "Deferred already resolved/rejected";
            }
        },
        promise: function () {
            return {
                isPromise: true,
                done: this.done.bind(this),
                fail: this.fail.bind(this),
                then: this.then.bind(this)
            };
        },
        done: function (callback) {
            this.successQueue.unshift(callback);
            if (this.state === state.fulfilled)
                processCallbackQueue(this.successQueue, this.value);

            return this.promise();
        },
        fail: function (callback) {
            this.failureQueue.unshift(callback);
            if (this.state === state.rejected)
                processCallbackQueue(this.failureQueue, this.value);

            return this.promise();
        },
        then: function (success, failure) {
            var def = new Deferred();

            this.done(function () {
                var promise = success.apply(null, arguments);
                if (promise)
                    promise.done(def.resolve.bind(def)).fail(def.reject.bind(def));
            }).fail(function () {
                var promise = failure.apply(null, arguments);
                if (promise)
                    promise.done(def.resolve.bind(def)).fail(def.reject.bind(def));
            });

            return def.promise();
        }
    };

    return Deferred;
})();