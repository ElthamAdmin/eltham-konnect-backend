/*
 * Jamaican public holidays and approved EKOS collection
 * closures used for storage calculations in 2027.
 *
 * December 27 is an approved Eltham Konnect closure,
 * regardless of its eventual public-holiday designation.
 *
 * Update this calendar if additional holidays or
 * collection closures are announced.
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
    name: "Eltham Konnect collection closure",
    companyClosure: true,
  },
];

/*
 * Approved operational calendar for storage calculations.
 * Other years remain blocked until their calendars are added.
 */
const confirmedYears = [2027];

const getJamaicaHolidayCalendar = () => ({
  holidays: jamaicaHolidays2027.map((holiday) => ({ ...holiday })),
  coveredYears: [...confirmedYears],
});

module.exports = {
  getJamaicaHolidayCalendar,
};