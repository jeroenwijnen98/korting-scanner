export class StoreAdapter {
  constructor(name) {
    this.name = name;
  }

  async searchProducts(query) {
    throw new Error('Not implemented');
  }

  async checkBonus(savedProducts) {
    throw new Error('Not implemented');
  }

  normalize(raw) {
    throw new Error('Not implemented');
  }
}
