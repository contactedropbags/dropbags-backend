const TOTAL_LOCKERS = 28;

let assigning = false;

let lockers = Array.from({ length: TOTAL_LOCKERS }, (_, i) => ({
  number: i + 1,
  occupied: false
}));

function assignLocker() {

  if (assigning) {
    return null
  }

  assigning = true

  const freeLocker = lockers.find(l => !l.occupied)

  if (!freeLocker) {
    assigning = false
    return null
  }

  freeLocker.occupied = true

  assigning = false

  return freeLocker.number
}

function releaseLocker(lockerNumber) {
  const locker = lockers.find(l => l.number === lockerNumber);

  if (locker) {
    return null;
  }
  locker.occupied = false;

  return locker;
}

function getLockersStatus() {
   return lockers.find(l => !l.occupied);
}

module.exports = {
  assignLocker,
  releaseLocker,
  getLockersStatus
};