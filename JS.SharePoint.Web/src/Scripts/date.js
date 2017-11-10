var date = (function () {

    function DateRange(rangeStart, rangeEnd) {
        this.rangeStart = rangeStart;
        this.rangeEnd = rangeEnd;
    }

    DateRange.prototype = {
        forEachDay: function (callback) {
            var curDate = new Date(this.rangeStart);
            while (curDate < this.rangeEnd) {
                callback(new Date(curDate));
                curDate.setDate(curDate.getDate() + 1);
            }
        },
        intersects: function (rangeStart, rangeEnd) {
            rangeEnd = rangeEnd || rangeStart;
            return !(this.rangeEnd <= rangeStart ||
                   this.rangeStart >= rangeEnd);
        }
    };

    var weekDay = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday"
    ];

    var month = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];

    var dateFormatRegex = /{([^}{]+)}/g;

    function DateFormat(date) {
        this.date = date;
    }

    DateFormat.prototype = {
        get y() {
            return this.yyyy.slice(-1);
        },
        get yy() {
            return this.yyyy.slice(-2);
        },
        get yyy() {
            return this.yyyy.slice(-3);
        },
        get yyyy() {
            return this.date.getFullYear().toString();
        },
        get M() {
            return (this.date.getMonth() + 1).toString();
        },
        get MM() {
            return ("0" + this.M).slice(-2);
        },
        get MMM() {
            return this.MMMM.slice(0, 3);
        },
        get MMMM() {
            return month[this.date.getMonth()];
        },
        get d() {
            return this.date.getDate().toString();
        },
        get dd() {
            return ("0" + this.d).slice(-2);
        },
        get ddd() {
            return this.dddd.slice(0, 3);
        },
        get dddd() {
            return weekDay[this.date.getDay()];
        },
        get m() {
            return this.date.getMinutes().toString();
        },
        get mm() {
            return ("0" + this.m).slice(-2);
        },
        get h() {
            var hours = this.date.getHours();
            if (hours > 12)
                return hours - 12;

            return hours.toString();
        },
        get hh() {
            return ("0" + this.h).slice(-2);
        },
        get H() {
            return this.date.getHours().toString();
        },
        get HH() {
            return ("0" + this.H).slice(-2);
        },
        get s() {
            return this.date.getSeconds().toString();
        },
        get ss() {
            return ("0" + this.s).slice(-2);
        },
        get ms() {
            return this.date.getMilliseconds().toString();
        },
        get t() {
            return this.tt.slice(0, 1);
        },
        get tt() {
            return this.date.getHours() > 11 ? "PM" : "AM";
        },
        format: function (formatStr) {
            var self = this;
            return formatStr.replace(dateFormatRegex, function (match, p1) {
                return self[p1];
            });
        }
    }

    function getCalendarMonthRange(date) {
        var monthRange = getMonthRange(date);
        var rangeStart = monthRange.rangeStart;
        var rangeEnd = monthRange.rangeEnd;

        if (rangeStart.getDay() != 0)
            rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
        if (rangeEnd.getDay() != 0)
            rangeEnd.setDate(rangeEnd.getDate() + (7 - rangeEnd.getDay()));

        return new DateRange(rangeStart, rangeEnd);
    }

    function getMonthRange(date) {
        var rangeStart = new Date(date);
        rangeStart.setDate(1);
        rangeStart.setHours(0);
        rangeStart.setMinutes(0);
        rangeStart.setSeconds(0);
        rangeStart.setMilliseconds(0);

        var rangeEnd = new Date(rangeStart);
        rangeEnd.setMonth(rangeEnd.getMonth() + 1);

        return new DateRange(rangeStart, rangeEnd);
    }

    function getWeekRange(date) {
        var range = getDayRange(date);
        var rangeStart = range.rangeStart;
        var rangeEnd = range.rangeEnd;

        if (rangeStart.getDay() != 0)
            rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
        if (rangeEnd.getDay() != 0)
            rangeEnd.setDate(rangeEnd.getDate() + (7 - rangeEnd.getDay()));

        return new DateRange(rangeStart, rangeEnd);
    }

    function getDayRange(date) {
        var rangeStart = new Date(date);
        rangeStart.setHours(0);
        rangeStart.setMinutes(0);
        rangeStart.setSeconds(0);
        rangeStart.setMilliseconds(0);

        var rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeEnd.getDate() + 1);

        return new DateRange(rangeStart, rangeEnd);
    }

    var isoDateRegex = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

    function DateParser(date) {
        this.date = null;
        if (!date) {
            this.date = new Date();
        }
        else if (typeof date === 'string') {
            var isoMatch = null;
            if (isoMatch = date.match(isoDateRegex)) {
                var year = parseInt(isoMatch[1]);
                var month = parseInt(isoMatch[2]) - 1;
                var day = parseInt(isoMatch[3]);
                var hour = parseInt(isoMatch[4]);
                var minute = parseInt(isoMatch[5]);
                var second = parseInt(isoMatch[6]);
                this.date = new Date(year, month, day, hour, minute, second);
            }
            else {
                this.date = new Date(Date.parse(date));
            }
        }
        else {
            this.date = date;
        }
        this.dateFormat = new DateFormat(this.date);
    }

    DateParser.prototype = {
        get str() {
            var df = new DateFormat(this.date);
            return {
                month: df.format.bind(df, "{MMMM}"),
                shortMonth: df.format.bind(df, "{MMM}"),
                day: df.format.bind(df, "{dddd}"),
                shortDay: df.format.bind(df, "{ddd}"),
                time: df.format.bind(df, "{h}:{mm}:{ss} {tt}"),
                shortTime: df.format.bind(df, "{h}:{mm} {tt}"),
                shortDateTime: df.format.bind(df, "{M}/{d}/{yyyy} {h}:{mm} {tt}"),
                shortDate: df.format.bind(df, "{M}/{d}/{yyyy}"),
                localISO: df.format.bind(df, "{yyyy}-{M}-{d}T{H}:{mm}:{ss}.{ms}Z"),
                format: df.format.bind(df)
            };
        },
        get range() {
            return {
                day: getDayRange.bind(null, this.date),
                week: getWeekRange.bind(null, this.date),
                month: getMonthRange.bind(null, this.date),
                calendarMonth: getCalendarMonthRange.bind(null, this.date)
            };
        }
    }

    function date(date) {
        return new DateParser(date);
    };

    date.weekDays = weekDay;
    date.months = month;
    date.range = function(rangeStart, rangeEnd) {
        return new DateRange(rangeStart, rangeEnd);
    };
    date.format = function (date) {
        return new DateFormat(date);
    };

    return date;
})();