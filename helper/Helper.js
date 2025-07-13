function generateSlotsForDay(date) {
  const startTime = new Date(date);
  startTime.setHours(8, 0, 0, 0); // 8:00 AM

  const endTime = new Date(date);
  endTime.setHours(19, 0, 0, 0); // 7:00 PM (so include 6 PM slot)

  let slots = [];
  let currentTime = startTime;

  while (currentTime < endTime) {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const formattedTime = `${hours % 12 || 12}:${minutes === 0 ? '00' : minutes} ${hours < 12 ? 'AM' : 'PM'}`;
    slots.push(formattedTime);

    currentTime.setHours(currentTime.getHours() + 1); // Increment by 1 hour
  }

  return slots;
}

module.exports = { generateSlotsForDay };
