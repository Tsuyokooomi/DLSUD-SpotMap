// Mock data. This stands in for the backend until the API is ready.
// Once the backend exists, this file gets replaced by a fetch() call
// to your Express API, and PLACES gets filled from the response instead.

const PLACES = [
  {
    id: "p1",
    name: "Grumpy Joe Coffee",
    category: "cafe",
    tags: ["Milktea", "Coffee", "Study spot"],
    lat: 14.3294,
    lng: 120.9367,
    address: "Aguinaldo Hwy, Dasmariñas, Cavite",
    description: "Quiet corner spot, good for studying. Strong cold brew."
  },
  {
    id: "p2",
    name: "Island Cove Grill",
    category: "food",
    tags: ["Seafood", "Grilled", "Burger"],
    lat: 14.3411,
    lng: 120.9198,
    address: "Salitran, Dasmariñas, Cavite",
    description: "Grilled seafood, outdoor seating, gets busy on weekends."
  },
  {
    id: "p3",
    name: "Vista Mall Dasmariñas",
    category: "mall",
    tags: ["Cinema", "Grocery", "Food court"],
    lat: 14.3256,
    lng: 120.9375,
    address: "Governor's Dr, Dasmariñas, Cavite",
    description: "Groceries, cinema, and a wide food court."
  },
  {
    id: "p4",
    name: "Riverside Hangout Park",
    category: "hangout",
    tags: ["Open-air", "Food carts"],
    lat: 14.3350,
    lng: 120.9450,
    address: "Along the creek, Imus, Cavite",
    description: "Open-air spot, good for evening hangouts, some food carts nearby."
  },
  {
    id: "p5",
    name: "Kape't Tinapay",
    category: "cafe",
    tags: ["Milktea", "Bakery", "Pandesal"],
    lat: 14.3180,
    lng: 120.9420,
    address: "Salawag, Dasmariñas, Cavite",
    description: "Small bakery-cafe, fresh pandesal in the morning."
  },
  {
    id: "p6",
    name: "Robinsons Place Imus",
    category: "mall",
    tags: ["Grocery", "Department store"],
    lat: 14.4297,
    lng: 120.9367,
    address: "Imus, Cavite",
    description: "Standard mall setup, department store and supermarket."
  },
  {
    id: "p7",
    name: "Turo-Turo ni Nanay",
    category: "food",
    tags: ["Unlimited Rice", "Filipino", "Budget meal"],
    lat: 14.3225,
    lng: 120.9310,
    address: "Zone 3, Dasmariñas, Cavite",
    description: "Home-style Filipino dishes, unlimited rice with any order."
  }
];

// Local storage keys used until real accounts and a real backend exist.
const STORAGE_KEYS = {
  starred: "spotmap_starred",
  togo: "spotmap_togo",
  comments: "spotmap_comments"
};
