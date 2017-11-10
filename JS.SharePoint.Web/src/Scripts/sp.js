//! require("deferred")
//! require("ajax")
//! require("spCAML")
//! require("cachedb")

var sp = (function () {
    var guidRegex = /{?(\w\w\w\w\w\w\w\w-\w\w\w\w-\w\w\w\w-\w\w\w\w-\w\w\w\w\w\w\w\w\w\w\w\w)}?/;

    var peoplePickerIndex = 0;
    function peoplePickerControl(element, onUpdate, initialValue, options) {
        initialValue = initialValue || [];
        initialValue = Array.isArray(initialValue) ? initialValue : [initialValue];
        options = options || {};

        element.id = element.id || "ClientSidePeoplePicker_" + peoplePickerIndex++;

        var schema = {};
        schema['PrincipalAccountType'] = 'User,DL,SecGroup,SPGroup';
        schema['SearchPrincipalSource'] = 15;
        schema['ResolvePrincipalSource'] = 15;
        schema['AllowMultipleValues'] = true;
        schema['MaximumEntitySuggestions'] = 50;
        schema['Width'] = '280px';

        for (var key in options) {
            schema[key] = options[key];
        }

        sp.loadScripts(["sp.js", "clienttemplates.js", "clientforms.js", "clientpeoplepicker.js", "autofill.js"]).done(function () {
            SPClientPeoplePicker_InitStandaloneControlWrapper(element.id, null, schema);
            var pickerId = element.id + "_TopSpan";
            var picker = SPClientPeoplePicker.SPClientPeoplePickerDict[pickerId];
            var currentEntities = [];
            picker.AddUserKeys(initialValue.join(";"));
            picker.OnValueChangedClientScript = function (elementId, userInfo) {
                if (currentEntities.length != userInfo)
                    onUpdate(userInfo);
                currentEntities = userInfo;
            };
        });
    }

    function renderUserPresence(userData, schemaOverride) {
        schemaOverride = schemaOverride || { "WithPictureDetail": "1", "PictureSize": "Size_36px" };

        var renderCtx = new ContextInfo();
        renderCtx.Templates = {};
        renderCtx.Templates["Fields"] = {};

        var listSchema = { "EffectivePresenceEnabled": "1", "PresenceAlt": "User Presence" };
        return RenderUserFieldWorker(renderCtx, schemaOverride, userData, listSchema);
    }

    function userPresenceControl(userName, element, schemaOverride) {
        sp.loadScripts("clienttemplates.js").done(function () {
            var userPresenceCache =
                sp.controls.userPresence.userPresenceCache =
                sp.controls.userPresence.userPresenceCache || {};

            if (!userPresenceCache[userName]) {
                var def = new deferred();
                userPresenceCache[userName] = def.promise();
                sp.rest().userProfile.properties(userName, true).done(function (user) {
                    var userData = {
                        "id": user.AccountName || "", "department": user.Department || "", "jobTitle": user.Title || "",
                        "title": user.PreferredName || "", "email": user.WorkEmail || "", "picture": user.PictureURL || "", "sip": user["SPS-SipAddress"] || ""
                    };
                    def.resolve(userData);
                });
            }

            userPresenceCache[userName].done(function (userData) {
                element.innerHTML = renderUserPresence(userData, schemaOverride);
                ProcessImn();
            });
        });
    }

    function spRestUrl(rootUrlPromise, apiUrl, options) {
        var def = new deferred();

        var qsParams = [];
        for (var key in options) {
            if (key.match(/^\$|@/))
                qsParams.push(key + "=" + encodeURIComponent(options[key]));
        }
        var qs = "";
        if (qsParams.length > 0) {
            qs = qsParams.join("&");
            if (apiUrl.match(/\?/))
                qs = "&" + qs;
            else
                qs = "?" + qs;
        }

        rootUrlPromise.done(function (url) {
            def.resolve(url + apiUrl + qs);
        }).fail(def.reject.bind(def));

        return def.promise();
    }

    function tryJsonCache(key, url, refreshCallback) {
        var def = new deferred();

        cachedb.get(key + "-" + url, refreshCallback)
            .done(def.resolve.bind(def))
            .fail(def.reject.bind(def));

        return def.promise();
    }

    function getRestApi(rootUrlPromise, apiUrl, options) {
        var def = new deferred();

        spRestUrl(rootUrlPromise, apiUrl, options).done(function (url) {
            if (false && options.cacheKey) {
                tryJsonCache(options.cacheKey, url, function (callback) {
                    sp.getJSON(url)
                        .done(callback)
                        .fail(def.reject.bind(def));
                }).done(def.resolve.bind(def))
                    .fail(def.reject.bind(def));
            }
            else {
                sp.getJSON(url)
                    .done(def.resolve.bind(def))
                    .fail(def.reject.bind(def));
            }
        });

        return def.promise();
    }

    function postRestApi(rootUrlPromise, apiUrl, data, options) {
        var def = new deferred();

        spRestUrl(rootUrlPromise, apiUrl, options).done(function (url) {
            if (false && options.cacheKey) {
                tryJsonCache(options.cacheKey, url, function (callback) {
                    sp.postJSON(url, data)
                        .done(callback)
                        .fail(def.reject.bind(def));
                }).done(def.resolve.bind(def))
                    .fail(def.reject.bind(def));
            }
            else {
                sp.postJSON(url, data)
                    .done(def.resolve.bind(def))
                    .fail(def.reject.bind(def));
            }
        });

        return def.promise();
    }

    function restAPIWebData(rootUrlPromise, apiUrl, options) {
        apiUrl += "/web";
        return {
            get data() {
                return getRestApi(rootUrlPromise, apiUrl, options);
            },
            get lists() {
                apiUrl += "/lists";

                return {
                    get data() {
                        return getRestApi(rootUrlPromise, apiUrl, options);
                    },
                    add: function (object) {
                        return postRestApi(rootUrlPromise, apiUrl, object, options);
                    }
                }
            },
            list: function (nameGuid) {
                var match = guidRegex.exec(nameGuid);
                if (match)
                    apiUrl += "/lists(guid'" + match[1] + "')";
                else {
                    apiUrl += "/lists/GetByTitle(@list)";
                    options["@list"] = "'" + nameGuid + "'";
                }

                return {
                    get data() {
                        return getRestApi(rootUrlPromise, apiUrl, options);
                    },
                    item: function (id) {
                        apiUrl += "/items(" + id + ")";
                        return {
                            get data() {
                                return getRestApi(rootUrlPromise, apiUrl, options);
                            },
                            get attachments() {
                                apiUrl += "/AttachmentFiles";
                                return getRestApi(rootUrlPromise, apiUrl, options);
                            }
                        }
                        //return getRestApi(rootUrlPromise, apiUrl, options);
                    },
                    get items() {
                        apiUrl += "/items";
                        return {
                            get data() {
                                return getRestApi(rootUrlPromise, apiUrl, options);
                            },
                            add: function (newItem) {
                                return postRestApi(rootUrlPromise, apiUrl, newItem, options);
                            }
                        }
                    },
                    get fields() {
                        apiUrl += "/fields";
                        return {
                            get data() {
                                return getRestApi(rootUrlPromise, apiUrl, options);
                            },
                            add: function (object) {
                                var data = null;
                                if (object.SchemaXml || object.JSLink) {
                                    object['__metadata'] = { type: 'SP.Field' };
                                    data = object;
                                }
                                else {
                                    apiUrl += "/addfield";
                                    object['__metadata'] = { type: 'SP.FieldCreationInformation' };
                                    data = { parameters: object };
                                }
                                return postRestApi(rootUrlPromise, apiUrl, data, options);
                            }
                        }
                    },
                    query: function (query) {
                        apiUrl += "/getitems";
                        if (typeof query != 'string')
                            query = spCAML.fromJson(query);

                        var data = {
                            'query': {
                                '__metadata': { 'type': 'SP.CamlQuery' },
                                'ViewXml': query
                            }
                        };
                        return postRestApi(rootUrlPromise, apiUrl, data, options);
                    }
                }
            }
        }
    }

    function restAPIUserProfileData(rootUrlPromise, apiUrl, options) {
        apiUrl += "/SP.UserProfiles.PeopleManager";
        return {
            get myProperties() {
                apiUrl += "/GetMyProperties";
                var def = new deferred();

                getRestApi(rootUrlPromise, apiUrl, options).done(function (data) {
                    var props = {};
                    if (data.d.UserProfileProperties) {
                        for (var x = 0; x < data.d.UserProfileProperties.results.length; x++) {
                            var prop = data.d.UserProfileProperties.results[x];
                            props[prop.Key] = prop.Value;
                        }
                    }
                    def.resolve(data, props);
                }).fail(def.reject.bind(def));

                return def.promise();
            },
            property: function (accountName, property) {
                apiUrl += "/GetUserProfilePropertyFor(accountName=@v,propertyName='" + property + "')?@v='" + accountName + "'";
                return getRestApi(rootUrlPromise, apiUrl, options);
            },
            properties: function (accountName, processAllProperties) {
                apiUrl += "/GetPropertiesFor(@v)?@v='" + accountName + "'";
                if (!processAllProperties)
                    return getRestApi(rootUrlPromise, apiUrl, options);

                var def = new deferred();
                getRestApi(rootUrlPromise, apiUrl, options).done(function (data) {
                    var props = data.d.UserProfileProperties ?
                        data.d.UserProfileProperties.results : [{ Key: "AccountName", Value: accountName }];
                    var propObj = {};
                    for (var x = 0; x < props.length; x++) {
                        propObj[props[x].Key] = props[x].Value;
                    }
                    def.resolve(propObj);
                }).fail(def.reject.bind(def));

                return def.promise();
            }
        }
    }

    function restAPINavigationData(rootUrlPromise, apiUrl, options) {
        apiUrl += "/Navigation/MenuState";
        return {
            get local() {
                return getRestApi(rootUrlPromise, apiUrl, options);
            },
            get global() {
                apiUrl += "?mapprovidername='GlobalNavigationSwitchableProvider'";
                return getRestApi(rootUrlPromise, apiUrl, options);
            }
        }
    }

    function restAPISearchData(rootUrlPromise, apiUrl, options) {
        apiUrl += "/search";
        return {
            query: function (options) {
                if (options.properties) {
                    var props = [];
                    for (var key in options.properties) {
                        props.push(key + ":" + options.properties[key]);
                    }
                    options.properties = "'" + props.join() + "'";
                }

                if (options.selectproperties)
                    options.selectproperties = "'" + options.selectproperties.join() + "'";

                var qsParams = [];
                for (var key in options) {
                    qsParams.push(key + "=" + options[key]);
                }
                apiUrl += "/query?" + qsParams.join("&");
                return getRestApi(rootUrlPromise, apiUrl, options);
            }
        }
    }

    function restAPIData(options) {
        options = options || {};
        var apiUrl = "/_api";
        return {
            get rootWeb() {
                return restAPIWebData(sp.context.siteServerRelativeUrl, apiUrl, options);
            },
            get web() {
                return restAPIWebData(sp.context.webServerRelativeUrl, apiUrl, options);
            },
            get domainRoot() {
                return restAPIWebData(deferred.resolved(""), apiUrl, options);
            },
            subWeb: function (url) {
                var def = new deferred();

                sp.context.webServerRelativeUrl.done(function (webUrl) {
                    def.resolve(webUrl + url);
                }).fail(def.reject.bind(def));

                return restAPIWebData(def.promise(), apiUrl, options);
            },
            get userProfile() {
                return restAPIUserProfileData(sp.context.webServerRelativeUrl, apiUrl, options);
            },
            get navigation() {
                return restAPINavigationData(sp.context.webServerRelativeUrl, apiUrl, options);
            },
            get search() {
                return restAPISearchData(sp.context.webServerRelativeUrl, apiUrl, options);
            }
        };
    }

    var currentClientContext;
    function csomAPIData(context) {
        currentClientContext = currentClientContext || SP.ClientContext.get_current();
        var clientContext = context || currentClientContext;
        clientContext.__successCallbacks = clientContext.__successCallbacks || [];
        clientContext.__errorCallbacks = clientContext.__errorCallbacks || [];

        function pushCallbacks(csomObject) {
            var args = arguments;
            var def = new deferred();

            clientContext.__successCallbacks.push(function () {
                def.resolve.apply(def, args);
            });

            clientContext.__errorCallbacks.push(function () {
                def.reject();
            });

            var promise = def.promise();
            promise.__csomObject = csomObject;
            promise.load = function (loadAdditional) {
                if (csomObject) {
                    clientContext.load(csomObject);
                    if (loadAdditional) {
                        var additional = loadAdditional(csomObject);
                        for (var x = 0; x < additional.length; x++) {
                            clientContext.load(additional[x]);
                        }
                    }
                }
                return promise;
            }
            return promise;
        }

        var csom = {
            get context() {
                return clientContext;
            },
            load: function (csomObject) {
                clientContext.load(csomObject);
            },
            executeQuery: function () {
                var def = new deferred();

                clientContext.executeQueryAsync(function () {
                    for (var x = 0; clientContext.__successCallbacks && x < clientContext.__successCallbacks.length; x++) {
                        clientContext.__successCallbacks[x]();
                    }
                    clientContext.__successCallbacks = null;
                    def.resolve();
                }, function () {
                    for (var x = 0; clientContext.__errorCallbacks && x < clientContext.__errorCallbacks.length; x++) {
                        clientContext.__errorCallbacks[x].apply(null, arguments);
                    }
                    clientContext.__errorCallbacks = null;
                    def.reject.apply(def, arguments);
                });

                return def.promise();
            },
            web: {
                setCustomMasterPage: function (masterPageUrl, deferWebUpdate) {
                    var web = clientContext.get_web();
                    web.set_customMasterUrl(masterPageUrl);

                    if (!deferWebUpdate)
                        web.update();

                    return pushCallbacks();
                }
            },
            site: {
                removeFeature: function (featureGuid) {
                    var siteFeatures = clientContext.get_site().get_features();
                    siteFeatures.remove(featureGuid);

                    return pushCallbacks();
                }
            },
            list: function (title) {
                return {
                    fields: {
                        addAsXml: function (fieldXml, addToDefaultView, addFieldOptions) {
                            var fields = clientContext.get_web().get_lists().getByTitle(title).get_fields();
                            var field = fields.addFieldAsXml(fieldXml, addToDefaultView, addFieldOptions);

                            return pushCallbacks(field);
                        }
                    }
                };
            },
            taxonomy: function (locale) {
                locale = locale || 1033;
                var def = new deferred();
                sp.loadScripts(["sp.taxonomy.js"]).done(function () {
                    var taxonomySession = SP.Taxonomy.TaxonomySession.getTaxonomySession(clientContext);
                    def.resolve({
                        termSetsByName: function (name) {
                            var termSets = taxonomySession.getTermSetsByName(name, locale);
                            return pushCallbacks(termSets);
                        }
                    });
                });

                return def.promise();
            },
            get userProfiles() {
                var def = new deferred();

                sp.loadScripts(["sp.userprofiles.js"]).done(function () {
                    def.resolve({
                        userProfileForUser: function (userName, propertyNames) {
                            var def = new deferred();
                            var peopleManager = new SP.UserProfiles.PeopleManager(clientContext);
                            var userProfilePropertiesForUser = new SP.UserProfiles.UserProfilePropertiesForUser(clientContext, userName, propertyNames);
                            var userProfileProperties = peopleManager.getUserProfilePropertiesFor(userProfilePropertiesForUser);
                            pushCallbacks(userProfileProperties).done(function (properties) {
                                var propObj = {};
                                for (var x = 0; x < propertyNames.length; x++) {
                                    propObj[propertyNames[x]] = properties[x];
                                }
                                def.resolve(propObj);
                            }).fail(def.reject.bind(def));
                            return def.promise();
                        }
                    });
                });

                return def.promise();
            },
            /* userProfileForUser: function (userName, propertyNames) {
                
                var peopleManager = new SP.UserProfiles.PeopleManager(clientContext);
                var userProfilePropertiesForUser = new SP.UserProfiles.UserProfilePropertiesForUser(clientContext, userName, propertyNames);
                var userProfileProperties = peopleManager.getUserProfilePropertiesFor(userProfilePropertiesForUser);
                return pushCallbacks(userProfileProperties);
            }, */
            webparts: {
                getProperties: function (wpId) {
                    var def = new deferred();

                    var oFile = clientContext.get_web()
                        .getFileByServerRelativeUrl(_spPageContextInfo.serverRequestPath);
                    var limitedWebPartManager =
                        oFile.getLimitedWebPartManager(SP.WebParts.PersonalizationScope.shared);
                    var collWebPart = limitedWebPartManager.get_webParts();

                    clientContext.load(collWebPart);
                    clientContext.executeQueryAsync(function () {
                        var webPartDef = null;
                        for (var x = 0; x < collWebPart.get_count() && !webPartDef; x++) {
                            var temp = collWebPart.get_item(x);
                            if (temp.get_id().toString() === wpId) {
                                webPartDef = temp;
                            }
                        }
                        if (!webPartDef) {
                            def.reject("Web Part: " + wpId + " not found on page: "
                                + _spPageContextInfo.webServerRelativeUrl);
                            return;
                        }
                        var webPartProperties = webPartDef.get_webPart().get_properties();
                        clientContext.load(webPartProperties);
                        clientContext.executeQueryAsync(function () {
                            def.resolve(webPartProperties, webPartDef, clientContext);
                        }, function () {
                            def.reject("Failed to load web part properties");
                        });
                    }, function () {
                        def.reject("Failed to load web part collection");
                    });

                    return def.promise();
                },
                saveProperties: function (wpId, obj) {
                    var def = new deferred();

                    csom.webparts.getProperties(wpId).done(function (webPartProperties, webPartDef, clientContext) {
                        for (var key in obj) {
                            webPartProperties.set_item(key, obj[key]);
                        }
                        webPartDef.saveWebPartChanges();
                        clientContext.executeQueryAsync(function () {
                            def.resolve();
                        }, function () {
                            def.reject("Failed to save web part properties");
                        });
                    }).fail(def.reject.bind(def));

                    return def.promise();
                },
                updateProperties: function (wpId, processProperties) {
                    var def = new deferred();
                    csom.webparts.getProperties(wpId).done(function (webPartProperties) {
                        var obj = processProperties(webPartProperties.get_fieldValues());
                        csom.webparts.saveProperties(wpId, obj)
                            .done(def.resolve.bind(def))
                            .fail(def.reject.bind(def));
                    }).fail(def.reject.bind(def));
                    return def.promise();
                }
            }
        }

        return csom;
    }

    var sp = {
        loadScripts: function (scripts) {
            scripts = Array.isArray(scripts) ? scripts : [scripts];
            var def = new deferred();

            sp.context.webServerRelativeUrl.done(function (url) {
                for (var x = 0; x < scripts.length; x++) {
                    if (!_v_dictSod[scripts[x]]) {
                        SP.SOD.registerSod(scripts[x], url + '/_layouts/15/' + scripts[x]);
                    }
                }

                var promises = scripts.map(function (c) {
                    var scriptDef = new deferred();
                    SP.SOD.loadMultiple([c], function () {
                        scriptDef.resolve();
                    });
                    return scriptDef.promise();
                });

                deferred.all(promises).done(def.resolve.bind(def));
            });

            return def.promise();
        },
        getJSON: function (url) {
            return ajax.getJSON(url, "application/json; odata=verbose");
        },
        postJSON: function (url, data, digest, headers) {
            data = data || {};
            var def = new deferred();
            if (!digest) {
                var baseUrl = url.split(/\/_api/i)[0].toLowerCase();
                sp.context.webServerRelativeUrl.done(function (webUrl) {
                    var digestInput = null;
                    if (webUrl.toLowerCase() == baseUrl && (digestInput = document.getElementById("__REQUESTDIGEST"))) {
                        sp.postJSON(url, data, digestInput.value, headers)
                            .done(def.resolve.bind(def))
                            .fail(def.reject.bind(def));
                    }
                    else {
                        sp.context.remoteDigest(baseUrl).done(function (value) {
                            sp.postJSON(url, data, value, headers)
                                .done(def.resolve.bind(def))
                                .fail(def.reject.bind(def));
                        });
                    }
                });
            }
            else {
                headers = headers || {};
                headers["X-RequestDigest"] = digest;
                headers["Content-Type"] = "application/json; odata=verbose";
                ajax.postJSON(url, data, "application/json; odata=verbose", headers)
                    .done(def.resolve.bind(def))
                    .fail(def.reject.bind(def));
            }
            return def.promise();
        },
        mergeJSON: function (url, data, digest) {
            return sp.postJSON(url, data, digest, { "X-HTTP-Method": "MERGE", "IF-MATCH": "*" });
        },
        delete: function (url, digest) {
            return sp.postJSON(url, null, digest, { "X-HTTP-Method": "DELETE", "IF-MATCH": "*" });
        },
        context: {
            pageInfo: function (property) {
                var def = new deferred();
                if (!_spPageContextInfo) {
                    sp.loadScripts("sp.js").done(function () {
                        var val = property ? _spPageContextInfo[property] : _spPageContextInfo;
                        def.resolve(val);
                    });
                }
                else {
                    var val = property ? _spPageContextInfo[property] : _spPageContextInfo;
                    def.resolve(val);
                }
                return def.promise();
            },
            get webServerRelativeUrl() {
                var def = new deferred();
                sp.context.pageInfo("webServerRelativeUrl").done(function (val) {
                    val = val.replace(/\/$/, "");
                    def.resolve(val);
                });
                return def.promise();
            },
            get siteServerRelativeUrl() {
                var def = new deferred();
                sp.context.pageInfo("siteServerRelativeUrl").done(function (val) {
                    val = val.replace(/\/$/, "");
                    def.resolve(val);
                });
                return def.promise();
            },
            get pageListId() {
                var def = new deferred();
                sp.context.pageInfo("pageListId").done(def.resolve.bind(def));
                return def.promise();
            },
            get userId() {
                return sp.context.pageInfo("userId");
            },
            get digest() {
                var def = new deferred();
                sp.context.webServerRelativeUrl.done(function (url) {
                    sp.context.remoteDigest(url)
                        .done(def.resolve.bind(def))
                        .fail(def.reject.bind(def));
                });
                return def.promise();
            },
            remoteDigestCache: {},
            remoteDigest: function (url) {
                if (!sp.context.remoteDigestCache[url]) {
                    sp.context.remoteDigestCache[url] = new deferred();
                    sp.postJSON(url + "/_api/contextinfo", {}, "temp").done(function (data) {
                        var digest = data.d.GetContextWebInformation.FormDigestValue;
                        sp.context.remoteDigestCache[url].resolve(digest);
                    });
                }

                return sp.context.remoteDigestCache[url].promise();
            }
        },
        controls: {
            peoplePicker: peoplePickerControl,
            userPresence: userPresenceControl
        },
        user: {
            get current() {
                var def = new deferred();
                sp.context.userId.done(function (userId) {
                    sp.user.getById(userId)
                        .done(def.resolve.bind(def))
                        .fail(def.reject.bind(def));
                });
                return def.promise();
            },
            getById: function (userId) {
                var def = new deferred();
                sp.context.webServerRelativeUrl.done(function (url) {
                    sp.getJSON(url + "/_api/web/GetUserById(" + userId + ")")
                        .done(def.resolve.bind(def))
                        .fail(def.resolve.bind(def));
                });
                return def.promise();
            },
        },
        get csom() {
            var def = new deferred();
            sp.loadScripts(["sp.js"]).done(function () {
                def.resolve(csomAPIData);
            });
            return def.promise();
        },
        page: {
            get inEditMode() {
                var inEditMode = null;
                var wikiInEditMode = null;
                var pageStateIsEdit = null;
                if (typeof MSOWebPartPageFormName != 'undefined') {
                    if (document.forms[MSOWebPartPageFormName].MSOLayout_InDesignMode) {
                        inEditMode = document.forms[MSOWebPartPageFormName].MSOLayout_InDesignMode.value == "1";
                    }
                    if (document.forms[MSOWebPartPageFormName]._wikiPageMode) {
                        wikiInEditMode = document.forms[MSOWebPartPageFormName]._wikiPageMode.value == "Edit";
                    }
                }

                pageStateIsEdit = (typeof PageState != 'undefined') && PageState.ViewModeIsEdit == 1;

                return !!(inEditMode || wikiInEditMode || pageStateIsEdit);
            }
        },
        rest: function (options) {
            return restAPIData(options);
        },
        profileData: function (options) {
            return userProfileData(options);
        }
    };

    return sp;
})();