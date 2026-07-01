const axios = require('axios');
require('dotenv').config();
const { Log } = require('../logging-middleware/logger');

const API_URL = 'http://4.224.186.213/evaluation-service/notifications';
const WEIGHT = { Placement: 3, Result: 2, Event: 1 };


class MinHeap {
  constructor(compare) {
    this.heap = [];
    this.compare = compare;
  }
  size() { return this.heap.length; }
  peek() { return this.heap[0]; }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent])) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  _bubbleDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compare(this.heap[left], this.heap[smallest])) smallest = left;
      if (right < n && this.compare(this.heap[right], this.heap[smallest])) smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

function score(n) {
  return { weight: WEIGHT[n.Type] || 0, time: new Date(n.Timestamp).getTime() };
}

function isLower(a, b) {
  if (a.weight !== b.weight) return a.weight < b.weight;
  return a.time < b.time;
}

class TopNTracker {
  constructor(n) {
    this.n = n;
    this.heap = new MinHeap((a, b) => isLower(a._score, b._score));
  }

  add(notification) {
    const scored = { ...notification, _score: score(notification) };
    if (this.heap.size() < this.n) {
      this.heap.push(scored);
    } else if (isLower(this.heap.peek()._score, scored._score)) {
      this.heap.pop();
      this.heap.push(scored);
    }
  }

  getTopSorted() {
    return [...this.heap.heap]
      .sort((a, b) => (isLower(a._score, b._score) ? 1 : -1))
      .map(({ _score, ...rest }) => rest);
  }
}

async function fetchNotifications() {
  const response = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` }
  });
  return response.data.notifications;
}

async function main() {
  await Log('backend', 'info', 'service', 'Starting priority inbox computation');

  let notifications;
  try {
    notifications = await fetchNotifications();
    await Log('backend', 'info', 'service', `Fetched ${notifications.length} notifications`);
  } catch (error) {
    await Log('backend', 'error', 'service', `Failed to fetch notifications: ${error.message}`);
    console.error('Could not fetch notifications:', error.message);
    return;
  }

  const tracker = new TopNTracker(10);
  for (const n of notifications) tracker.add(n);

  const top10 = tracker.getTopSorted();
  await Log('backend', 'info', 'service', `Computed top ${top10.length} priority notifications`);

  console.log('\n=== TOP 10 PRIORITY NOTIFICATIONS ===\n');
  top10.forEach((n, i) => {
    console.log(`${i + 1}. [${n.Type}] ${n.Message}  (${n.Timestamp})`);
  });
}

main();