var spCAML = (function () {

    function xml(name, attributes, value) {
        if (value && value instanceof Array)
            value = value.join("");
        if (value && typeof value != 'string')
            value = value.toString();

        var parts = "<" + name;
        for (var key in attributes) {
            parts += " " + key + "='" + attributes[key] + "'";
        }
        if (value && value.length > 0) {
            parts += ">" + value + "</" + name + ">";
        }
        else {
            parts += " />";
        }
        return parts;
    }
	
    function createNestedNode(name, attributes, children) {
        if( !children )
            return null;
			
        var ret = null;
        if( children.length > 2 ) {
            var node1 = children[0];
            var node2 = createNestedNode(name, attributes, children.slice(1));
            ret = xml(name, attributes, [node1, node2]);
        }
        else if( children.length === 2 ) {
            ret = xml(name, attributes, children);
        }
        else {
            ret = children[0];
        }
        return ret;
    }
	
    function createFieldValue(fieldName, fieldType, fieldValue, includeTime) {
        var valueAttributes = { Type: fieldType };
        if (includeTime)
            valueAttributes.IncludeTimeValue = true;

        return [
			xml("FieldRef", { Name: fieldName }), 
			fieldType && fieldValue ? 
				xml("Value", valueAttributes, fieldValue) : 
				null
        ];
    }
	
    function parseJsonWhere(where) {
        var nodes = [];
        for( var key in where ) {
            if (key === "And" || key === "Or") {
                var value = where[key];
                if (!(value instanceof Array))
                    value = [value];

                nodes.push(createNestedNode(key, {}, Array.prototype.concat.apply([], value.map(function (c) {
                    return parseJsonWhere(c);
                }))));
            }
            else {
                var comparison = where[key];
                for (var fieldName in comparison) {
                    var field = comparison[fieldName];
                    var value = field.value;
                    var includeTime = field.includeTime;

                    if (!(value instanceof Array))
                        value = [value];

                    for (var x = 0; x < value.length; x++)
                        nodes.push(xml(key, {}, createFieldValue(fieldName, field.type, value[x], includeTime)));
                }
            }
        }
        return nodes;
    }

    function parseViewFields(viewFields) {
        return xml("ViewFields", {}, viewFields.map(function (c) {
            return xml("FieldRef", { Name: c });
        }));
    }
	
    function parseJsonOrderBy(orderBy) {
        var fields = [];
        for( var key in orderBy ) {
            fields.push(xml("FieldRef", { Name: key, Ascending: !!orderBy[key] }));
        }
		
        return xml("OrderBy", {}, fields);
    }
	
    function parseJsonView(view) {
        return xml("View", {}, [
			xml("Query", {}, [
				parseJsonOrderBy(view.orderBy || {}),
				xml("Where", {}, parseJsonWhere(view.where))
			]),
            view.rowLimit && xml("RowLimit", {}, view.rowLimit),
            view.viewFields && parseViewFields(view.viewFields)
        ]);
    }

    var spCAML = {
        fromJson: parseJsonView
    };

    return spCAML;
})();