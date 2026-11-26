import type { AppState } from './types';

export const FAST_FOOD = ['Maccas', 'GYG', 'KFC'];
export const GROCERY = ['Coles', 'Woolies', 'IGA'];
export const BOTTLE_SHOP = "Dan Murphy's";
export const SHOPS = [...FAST_FOOD, 'Other', ...GROCERY, BOTTLE_SHOP];

const MIN = 60_000;

export function seedState(): AppState {
  const now = Date.now();
  return {
    meId: 'steve',
    people: [
      { id: 'steve', name: 'Steve', color: '#FFB38A', adult: true },
      { id: 'mum', name: 'Mum', color: '#F5C6E0', adult: true },
      { id: 'isla', name: 'Isla', color: '#B3A6FF', adult: true },
      { id: 'lewis', name: 'Lewis', color: '#8FD3FF', adult: true },
      { id: 'emmett', name: 'Emmett', color: '#6FD3A8', adult: false },
    ],
    groups: [
      {
        id: 'clout',
        name: 'Team Clout',
        type: 'family',
        ownerId: 'steve',
        memberIds: ['steve', 'mum', 'isla', 'lewis', 'emmett'],
      },
    ],
    activeGroupId: 'clout',
    cards: [
      {
        id: 'job-washing',
        kind: 'job',
        groupId: 'clout',
        createdBy: 'mum',
        createdAt: now - 30 * MIN,
        forIds: ['isla', 'lewis', 'emmett'],
        status: 'open',
        notMe: [],
        title: 'Bring the washing in',
      },
    ],
    ledger: [],
    usuals: {
      steve: { GYG: ['Chicken Cali burrito, spicy', 'Large chips'] },
      lewis: { GYG: ['Chicken burrito, extra chicken, no pico', 'Chicken quesadilla'] },
      emmett: { KFC: ['Large Zinger Box, 7 Up, chocolate mousse'] },
      isla: { KFC: ['3 piece original tenders box'], GYG: ['Grilled chicken burrito bowl, guac, no pico, no tomatillo'] },
      mum: { Maccas: ['Sausage and egg muffin meal, strawberry shake'] },
    },
  };
}
