/*
 * Preliminary Jamaican calendar for 2027.
 *
 * Review official announcements before using this list
 * for live storage charges. Special holidays or closures
 * may be announced later.
 *
 * December 27 is included provisionally because Christmas
 * falls on Saturday and Boxing Day falls on Sunday.
 */

const jamaicaHolidays2027 = [
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-02-10", name: "Ash Wednesday" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-05-24", name: "Labour Day observed" },
  { date: "2027-08-02", name: "Emancipation Day observed" },
  { date: "2027-08-06", name: "Independence Day" },
  { date: "2027-10-18", name: "National Heroes' Day" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-26", name: "Boxing Day" },
  {
    date: "2027-12-27",
    name: "Potential Boxing Day observance",
    provisional: true,
  },
];

/*
 * No year is marked confirmed yet. The calculator must
 * not treat this preliminary list as complete.
 */
const confirmedYears = [];

const getJamaicaHolidayCalendar = () => ({
  holidays: jamaicaHolidays2027.map((holiday) => ({ ...holiday })),
  coveredYears: [...confirmedYears],
});

module.exports = {
  getJamaicaHolidayCalendar,
};