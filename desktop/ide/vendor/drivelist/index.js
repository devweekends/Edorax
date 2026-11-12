'use strict';
// Local stand-in for drivelist (native drive enumeration). The IDE only uses it
// for the drive picker, so an empty list is safe for local development.
function list(callback) {
  const result = Promise.resolve([]);
  if (typeof callback === 'function') {
    result.then((drives) => callback(null, drives));
    return;
  }
  return result;
}
module.exports = { list };
