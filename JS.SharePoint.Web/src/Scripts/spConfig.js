//! require("sp")
//! require("deferred")

var spConfig = (function () {
    
    function logInfo(message) {
        console.log(message);
    }

    function logError(message) {
        console.error(message);
    }

    function SPConfig(newLogInfo, newLogError) {
        this.logInfo = newLogInfo || logInfo;
        this.logError = newLogError || logError;
    }

    SPConfig.prototype = {
        configure: function (configDefinition) {
            var self = this;
            var def = new deferred();

            var methods = [];

            if (configDefinition.siteFeature)
                methods.push(self.removeSiteFeature.bind(self, configDefinition.siteFeature));
            if (configDefinition.webFeature)
                methods.push(self.removeWebFeature.bind(self, configDefinition.webFeature));
            if (configDefinition.customMasterPage)
                methods.push(self.setCustomMasterPage.bind(self, configDefinition.customMasterPage));

            methods.push(function () {
                var def = new deferred();
                sp.csom.done(function (csom) {
                    csom().executeQuery()
                        .done(def.resolve.bind(def))
                        .fail(def.reject.bind(def));
                });
                return def.promise();
            });

            methods.push(self.lists.bind(self, configDefinition.lists));

            deferred.sequence(methods, true).done(function () {
                self.logInfo("Configuration complete");
                def.resolve();
            }).fail(function () {
                self.logError("Error during configuration");
                def.reject();
            });

            return def.promise();
        },
        lists: function (listDefinitions) {
            if (!listDefinitions)
                return deferred.resolved();

            var methods = [];
            for (var x = 0; x < listDefinitions.length; x++) {
                methods.push(this.list.bind(this, listDefinitions[x]));
            }

            return deferred.sequence(methods, true);
        },
        list: function (listDefinition) {
            var self = this;
            var def = new deferred();

            if (!listDefinition.Title) {
                self.logError("list definitions requires a Title property");
                def.reject();
                return;
            }

            var listDef = {
                '__metadata': listDefinition['__metadata'] || { type: 'SP.List' },
                BaseTemplate: listDefinition.BaseTemplate || 100,
                Title: listDefinition.Title,
                AllowContentTypes: listDefinition.AllowContentTypes || false,
                Description: listDefinition.Description || "",
                ContentTypesEnabled: listDefinition.ContentTypesEnabled || false,
                EnableModeration: listDefinition.EnableModeration || false
            };

            if (listDefinition.TemplateFeatureId)
                listDef.TemplateFeatureId = listDefinition.TemplateFeatureId;

            var restWeb = listDefinition.rootWeb ? sp.rest().rootWeb : sp.rest().web;
            restWeb.list(listDef.Title).data.then(function () {
                self.logInfo(GAF.format("List '{0}' already exists", listDef.Title));
                return deferred.resolved();
            }, function () {
                self.logInfo(GAF.format("Creating list '{0}'", listDef.Title));
                return sp.rest().web.lists.add(listDef);
            }).then(function () {
                self.logInfo(GAF.format("Adding fields to list '{0}'", listDef.Title));
                var methods = [
                    self.fields.bind(self, listDef, listDefinition.fields),
                    self.lookupFields.bind(self, listDef, listDefinition.lookupFields),
                    self.managedMetadataFields.bind(self, listDef, listDefinition.managedMetadataFields)
                ];
                return deferred.sequence(methods);
            }, function () {
                self.logError(GAF.format("Error encountered creating list '{0}'", listDef.Title));
                def.reject();
            }).then(function () {
                self.logInfo(GAF.format("Completed adding fields to list '{0}'", listDef.Title));
                def.resolve();
            }, function () {
                self.logError(GAF.format("Error adding fields to list '{0}'", listDef.Title));
                def.reject();
            });

            return def.promise();
        },
        getNewFieldsForList: function (listDef, fieldDefinitions) {
            var self = this;
            var def = new deferred();
            var rest = sp.rest({ $select: "Title,StaticName" });
            var restWeb = listDef.rootWeb ? rest.rootWeb : rest.web;
            restWeb.list(listDef.Title).fields.data.then(function (fieldData) {

                var newFields = [];
                var fields = fieldData.d.results;

                for (var x = 0; x < fieldDefinitions.length; x++) {
                    var found = false;
                    for (var y = 0; y < fields.length && !found; y++) {
                        found = fieldDefinitions[x].Title === fields[y].Title ||
                                fieldDefinitions[x].StaticName === fields[y].StaticName ||
                                fieldDefinitions[x].StaticName === fields[y].Title;
                    }

                    if (!found) {
                        newFields.push(fieldDefinitions[x]);
                    }
                }

                def.resolve(newFields);
            }, function () {
                self.logError(GAF.format("Error requesting fields from list '{0}'", listDef.Title));
                def.reject();
            });
            return def.promise();
        },
        fields: function (listDef, fieldDefinitions) {
            if (!fieldDefinitions)
                return deferred.resolved();

            var self = this;
            var def = new deferred();

            this.getNewFieldsForList(listDef, fieldDefinitions).done(function (newFields) {
                var methods = newFields.map(function (c) {
                    return self.field.bind(self, listDef, c);
                });

                deferred.sequence(methods).done(def.resolve.bind(def)).fail(def.reject.bind(def));
            }).fail(function () {
                def.reject();
            });

            return def.promise();
        },
        field: function (listDef, fieldDefinition) {
            var self = this;
            var def = new deferred();

            var fieldCreationInfo = {
                Title: fieldDefinition.StaticName || fieldDefinition.Title,
                FieldTypeKind: fieldDefinition.FieldTypeKind,
                LookupListId: fieldDefinition.LookupListId,
                LookupFieldName: fieldDefinition.LookupFieldName,
                Required: !!fieldDefinition.Required
            };

            delete fieldDefinition.StaticName;
            delete fieldDefinition.LookupListId;
            delete fieldDefinition.LookupFieldName;

            var rest = sp.rest();
            var restWeb = listDef.rootWeb ? rest.rootWeb : rest.web;
            restWeb.list(listDef.Title).fields.add(fieldCreationInfo).done(function (newField) {
                newField = newField.d;
                for (var key in newField) {
                    if (fieldDefinition.hasOwnProperty(key))
                        newField[key] = fieldDefinition[key];
                }

                if (newField.FieldTypeKind === 11 ||
                    newField.FieldTypeKind === 8  ||
                    newField.FieldTypeKind === 7  ||
                    newField.FieldTypeKind === 3  ||
                    newField.FieldTypeKind === 15) {
                    delete newField.ValidationFormula;
                    delete newField.ValidationMessage;
                    delete newField.PrimaryFieldId;
                }

                sp.mergeJSON(newField.__metadata.uri, newField).done(function () {
                    self.logInfo(GAF.format("Added field '{0}' to list '{1}'", fieldCreationInfo.Title, listDef.Title));
                    def.resolve();
                }).fail(function () {
                    self.logError(GAF.format("Error updating field '{0}'", newField.Title));
                    def.reject();
                });
            }).fail(function () {
                self.logError(GAF.format("Error adding field '{0}' to list '{1}'", fieldCreationInfo.Title, listDef.Title));
                def.reject();
            });

            return def.promise();
        },
        lookupFields: function(listDef, lookupFieldDefinitions) {
            if (!lookupFieldDefinitions)
                return deferred.resolved();

            var self = this;
            var def = new deferred();

            var fields = [];
            var promises = lookupFieldDefinitions.map(function (c) {
                var def = new deferred();
                sp.rest({ $select: "Id" }).web.list(c.TargetList).data.done(function (data) {
                    c.Field.LookupListId = data.d.Id;
                    fields.push(c.Field);
                    def.resolve();
                });
                return def.promise();
            });

            deferred.all(promises).done(function () {
                self.fields(listDef, fields).done(function () {
                    def.resolve();
                }).fail(def.reject.bind(def));
            }).fail(def.reject.bind(def));

            return def.promise();
        },
        managedMetadataFields: function(listDef, fieldDefinitions) {
            if (!fieldDefinitions)
                return deferred.resolved();

            var self = this;
            var def = new deferred();

            this.getNewFieldsForList(listDef, fieldDefinitions).done(function (newFields) {
                var methods = newFields.map(function (c) {
                    return self.managedMetadataField.bind(self, listDef, c);
                });

                deferred.sequence(methods).done(def.resolve.bind(def)).fail(def.reject.bind(def));
            }).fail(function () {
                def.reject();
            });

            return def.promise();
        },
        managedMetadataField: function (listDef, mmFieldDefinition) {
            var self = this;
            var def = new deferred();
            var csom = null;
            var termSet = null;

            sp.csom.then(function (cs) {
                csom = cs;
                return csom().taxonomy();
            }, function () {
                self.logError("Error loading CSOM");
                def.reject();
            }).then(function (tax) {
                var promise = tax.termSetsByName(mmFieldDefinition.termSetName).load();
                csom().executeQuery();
                return promise;
            }, function () {
                self.logError("Error loading Taxonomy");
                def.reject();
            }).then(function (termSets) {
                termSet = termSets.getItemAtIndex(0);
                if (termSet) {
                    csom().load(termSet.get_termStore());
                    return csom().executeQuery();
                }
                else {
                    self.logError("Unabled to find term set with name '" + mmFieldDefinition.termSetName + "'");
                    def.reject();
                }
            }, function () {
                self.logError("Error requesting term set with name '" + mmFieldDefinition.termSetName + "'");
                def.reject();
            }).then(function () {
                var fieldType = mmFieldDefinition.multi ? "TaxonomyFieldTypeMulti" : "TaxonomyFieldType";
                var additionalAttributes = "";
                if (mmFieldDefinition.multi)
                    additionalAttributes += " Mult='TRUE' ";

                var title = mmFieldDefinition.Title;
                mmFieldDefinition.Title = mmFieldDefinition.StaticName || mmFieldDefinition.Title;

                var promise = csom().list(listDef.Title)
                    .fields.addAsXml("<Field Type='" + fieldType + "' Name='" + mmFieldDefinition.Title + "' DisplayName='" + mmFieldDefinition.Title + "'" + additionalAttributes + " />",
                                     false, SP.AddFieldOptions.defaultValue);
                var field = promise.__csomObject;
                var termSetId = termSet.get_id().toString();
                var termStoreId = termSet.get_termStore().get_id().toString();
                var taxField = csom().context.castTo(field, SP.Taxonomy.TaxonomyField);
                taxField.set_sspId(termStoreId);
                taxField.set_termSetId(termSetId);
                taxField.set_title(title);
                taxField.updateAndPushChanges(true);
                return csom().executeQuery();
            }, function () {
                self.logError("Error requesting term store");
                def.reject();
            }).then(function () {
                self.logInfo("Added and bound managed metadata field '" + mmFieldDefinition.Title + "'");
                def.resolve();
            }, function () {
                self.logError("Error binding managed metadata field '" + mmFieldDefinition.Title + "' to list '" + listDef.Title + "'");
                def.reject();
            });

            return def.promise();
        },
        removeSiteFeature: function (featureId) {
            var self = this;

            sp.csom.done(function (csom) {
                csom().site.removeFeature(featureId).done(function () {
                    self.logInfo(GAF.format("Feature '{0}' deactivated", featureId));
                }).fail(function () {
                    self.logError(GAF.format("Error deactivating feature '{0}'", featureId));
                });
            });

            return deferred.resolved();
        },
        removeWebFeature: function (featureId) {
            throw "removeWebFeature not implemented";
        },
        setCustomMasterPage: function (masterpageUrl) {
            var self = this;
            var def = new deferred();

            sp.context.siteServerRelativeUrl.done(function (url) {
                var masterUrl = url + masterpageUrl;
                sp.csom.done(function (csom) {
                    csom().web.setCustomMasterPage(masterUrl).done(function () {
                        self.logInfo(GAF.format("Masterpage '{0}' applied", masterpageUrl));
                    }).fail(function () {
                        self.logError(GAF.format("Error applying masterpage '{0}'", masterpageUrl));
                    });
                });
                def.resolve();
            });

            return def.promise();
        }
    };

    var config = new SPConfig();
    config.SPConfig = SPConfig;

    return config;
})();