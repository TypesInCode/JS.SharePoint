/* #Module.js
 * Module to manage and load other javascript modules. Exports global
 * module variable. Internal module class is exposed as `module.Module`
 *
 * ####exports
 * `var module = { Module: constructor() }`
 * 
 * **Usage**
 * ```
 * //loads module deployed to the same directory as module.js
 * module.require("other", function(other) {
 *   other.doStuff();
 * });
 * 
 * //defines a module without loading it. Module can later be loaded by name.
 * module.define({ name: "other", url: "/different/location/other.js" });
 * ```
 */

// module start
var module = (function () {

    function appendVersion(url, version) {
        return url + (version ? "?v=" + version : "");
    }

    function registerCss(url) {
        var link = document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.href = url;
        document.getElementsByTagName("head")[0].appendChild(link);
    }

    function registerScript(url, onload) {
        var script = document.createElement("script");
        script.setAttribute("type", "text/javascript");
        script.onload = onload;
        script.src = url;
        document.getElementsByTagName("head")[0].appendChild(script);
    }

    function loadFile(url, version, success, failure) {
        if (url.match(/\.css$/)) {
            registerCss(url);
            success();
        }
        else
            registerScript(url, success);
    }

    function requestScript(url, version, success, failure) {
        var req = new XMLHttpRequest();
        req.onreadystatechange = function () {
            if (req.readyState === XMLHttpRequest.DONE) {
                if (200 <= req.status && req.status < 300) {
                    success(req.responseText);
                }
                else {
                    failure(req.status);
                }
            }
        }
        req.open("GET", appendVersion(url, version));
        req.send();
    }

    function require(reference, alias) {
        return { reference: reference, alias: alias || (reference.name || reference) };
    }

    var requireRegex = /^\s*\/\/!\s*(require\([^\)]+\))/gm;
    function getRequiredModules(scriptBody) {
        var requireCalls = [];
        while (match = requireRegex.exec(scriptBody)) {
            requireCalls.push(match[1]);
        }
        var requiredModules = (new Function(["require"], "return [" + requireCalls.join() + "];"))(require);
        return requiredModules;
    }

    var firstVarRegex = /^\s*var\s*([^\s]+)\s*=\s*/m;
    function getModuleExport(scriptBody) {
        var varMatch = firstVarRegex.exec(scriptBody);
        return varMatch[1];
    }

    function loadModuleDependencies(loader, scriptBody, callback) {
        var requiredModules = getRequiredModules(scriptBody);

        requireModules(loader,
            requiredModules.map(function (c) { return c.reference; }),
            function () {
                callback(requiredModules.map(function (c) {
                    return c.alias;
                }), Array.prototype.slice.call(arguments));
        });
    }

    function executeModule(scriptBody, parameters, values) {
        var exports = getModuleExport(scriptBody);
        var func = new Function(parameters, scriptBody + " return " + exports + ";");
        return func.apply(null, values);
    }

    function loadScriptModule(loader, url, success, failure) {
        requestScript(url, loader.version, function (scriptBody) {
            loadModuleDependencies(loader, scriptBody, function (dependencyNames, dependencyValues) {
                var moduleValue = executeModule(scriptBody, dependencyNames, dependencyValues);
                success(moduleValue);
            });
        }, failure);
    }

    function loadModule(loader, url, global, success, failure) {
        if (url.match(/\.css$/) || global)
            loadFile(url, loader.version, function () { success(null); }, failure);
        else
            loadScriptModule(loader, url, success, failure);
    }

    function requireModules(loader, references, callback) {
        if (!references || references.length == 0) {
            callback();
            return;
        }

        var modules = references.map(function (c) {
            var mRef = new ModuleRef(loader, c);
            return loader.getFromCache(mRef, true);
        });

        var count = 0;
        var values = [];
        modules.forEach(function (c, i) {
            c.getValue(function (value) {
                values[i] = value;
                count++;
                if (count === modules.length)
                    callback.apply(null, values);
            });
        });
    }

    var moduleState = {
        defined: 0,
        loading: 1,
        loaded: 2,
        error: 3
    };

    function ModuleRef(loader, moduleRef) {
        moduleRef = ModuleRef.fillReference(moduleRef);
        this.loader = loader;
        this.state = moduleState.defined;
        this.name = moduleRef.name.toLowerCase();
        this.url = moduleRef.url;
        this.onload = moduleRef.onload || function () { };
        this.global = !!moduleRef.global;
        this.callbackQueue = [];
        this.value = null;
    }

    ModuleRef.fillReference = function (ref) {
        if (typeof ref === "string") {
            var fileName = ref.match(/\.js$|\.css$/) ? ref : ref + ".js";
            ref = { name: ref, url: Module.defaultUrl + fileName };
        }
        else if (ref.url) {
            ref.name = ref.name || ref.url.substring(ref.url.lastIndexOf("/") + 1);
        }
        else {
            var fileName = ref.name.match(/\.js$|\.css$/) ? ref.name : ref.name + ".js";
            ref.url = Module.defaultUrl + fileName;
        }
        return ref;
    };

    ModuleRef.prototype = {
        load: function(callback) {
            this.state = moduleState.loading;
            var self = this;
            loadModule(this.loader, this.url, this.global, function (value) {
                self.state = moduleState.loaded;
                self.value = value;
                self.onload();
                callback();
            }, function () {
                self.state = moduleState.error;
                throw "Error loading module at Url: " + self.url + " with name: " + self.name;
            });
        },
        getValue: function (callback) {
            if (this.state === moduleState.loaded) {
                callback(this.value);
                return;
            }

            var self = this;
            this.callbackQueue.push(callback);
            if (this.state === moduleState.defined) {
                this.load(function () {
                    while (self.callbackQueue.length > 0) {
                        self.callbackQueue.pop()(self.value);
                    }
                });
            }
        }
    };

    /** 
     * ##Class
     * #####Module: `constructor(options)`
     * Class providing functionality to load, cache and manage
     * JavaScript modules
     * 
     * **Parameters**  
     * **`options`** `object` Options variable (unused)
     */
    function Module() {
        this._moduleCache = {};
        this.version = null;
    }

    Module.defaultUrl = document.querySelector("script[src*='module.js']")
                            .src.split("module.js")[0];

    Module.prototype = {
        // ######defaultUrl: `get()`
        // **Returns**  
        // `string` Default module path
        get defaultUrl() {
            return Module.defaultUrl;
        },
        // ######define: `function(...moduleReferences)`  
        // Predefine a module
        //
        // **Parameters**  
        // **`...moduleReference`** `string|{name:string, url:string}` pass one to many 
        // filenames or moduleReference objects
        define: function (moduleReference) {
            var module = new ModuleRef(this, moduleReference);
            if (!this.isDefined(module))
                this._moduleCache[module.name] = module;
            else
                throw "Module: " + module.name + " is already defined";
        },
        isDefined: function(module) {
            return !!this.getFromCache(module);
        },
        getFromCache: function (module, insert) {
            var cacheM = this._moduleCache[module.name];
            if (insert && !cacheM)
                return this._moduleCache[module.name] = module;
            
            return cacheM;
        },
        
        // ######require: `function(...moduleReferences, function(...modules))`
        // Load specified modules
        //
        // **Parameters**  
        // **`...moduleReference`** `string|{name:string, url:string}`   
        // One to many filename or moduleReference objects  
        // **`callback`** `function(...values)`  
        // Callback method that receives export values from required modules
        require: function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            requireModules(this, args, callback);
        }
    };

    var ret = new Module();
    ret.Module = Module;
    return ret;
})();