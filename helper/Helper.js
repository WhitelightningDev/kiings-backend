function generateSlotsForDay(date) {
  const startTime = new Date(date);
  startTime.setHours(8, 0, 0, 0);

  const endTime = new Date(date);
  endTime.setHours(18, 0, 0, 0);

  const slots = [];
  let currentTime = new Date(startTime);

  while (currentTime < endTime) {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const formattedTime = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
    slots.push(formattedTime);
    currentTime.setMinutes(currentTime.getMinutes() + 30);
  }

  return slots;
}

module.exports = { generateSlotsForDay };
