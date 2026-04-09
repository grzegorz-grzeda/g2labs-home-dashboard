const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member', required: true },
  groupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true }],
});

module.exports = mongoose.model('User', userSchema);
