/**
 * Web stub for @react-native-async-storage/async-storage.
 * @metamask/sdk references this in browser builds; Next.js must resolve it.
 */
const memory = Object.create(null);

const AsyncStorage = {
  getItem: async (key) => (key in memory ? memory[key] : null),
  setItem: async (key, value) => {
    memory[key] = value;
  },
  removeItem: async (key) => {
    delete memory[key];
  },
  clear: async () => {
    for (const k of Object.keys(memory)) delete memory[k];
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
