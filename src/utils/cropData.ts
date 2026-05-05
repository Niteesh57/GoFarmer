export const CROP_CATEGORIES = {
  fruits: [
    "Avocados", "Kiwi", "Apples", "Oranges", "Lemons", "Limes", "Grapes", "Watermelons",
    "Strawberries", "Blueberries", "Raspberries", "Blackberries", "Cranberries", "Gooseberries",
    "Blackcurrants", "Redcurrants", "Mangoes", "Bananas", "Papayas", "Guavas", "Pomegranates",
    "Pineapples", "Jackfruit", "Peaches", "Pears", "Plums", "Apricots", "Sour Cherries",
    "Lychees", "Chickoo (Sapodilla)", "Sea Buckthorn", "Cantaloupes"
  ],
  vegetables: [
    "Potatoes", "Sweet Potatoes", "Tomatoes", "Onions", "Garlic", "Ginger", "Turmeric",
    "Carrots", "Cucumbers", "Bell Peppers", "Green Chilies", "Eggplant (Brinjal)", "Okra (Ladyfinger)",
    "Cauliflower", "Broccoli", "Cabbage", "Beets (Beetroot)", "Radishes", "Turnips", "Pumpkins",
    "Zucchini (Courgette)", "Green Peas", "Green Beans", "Bitter Gourd", "Bottle Gourd",
    "Drumsticks (Moringa Pods)", "Asparagus", "Celery"
  ],
  leafy_plants: [
    "Spinach", "Lettuce (Romaine/Iceberg)", "Kale", "Collard Greens", "Swiss Chard", "Arugula",
    "Mustard Greens (Sarson)", "Fenugreek (Methi)", "Amaranth", "Moringa Leaves", "Curry Leaves",
    "Bok Choy", "Dill", "Parsley", "Coriander (Cilantro)", "Sorrel", "Green Onions (Scallions)", "Watercress"
  ],
  staple_grains_and_nuts: [
    "Wheat", "Rice", "Corn (Maize)", "Soybeans", "Barley", "Oats", "Rye", "Buckwheat (Grechka)",
    "Millets (Bajra, Jowar, Ragi)", "Sorghum", "Sunflower Seeds", "Mustard Seeds", "Sugarcane",
    "Sugar Beets", "Almonds", "Walnuts", "Pistachios", "Cashews", "Pecans", "Peanuts",
    "Hazelnuts", "Cedar Nuts", "Chickpeas", "Lentils", "Coconuts"
  ]
};

export type CropCategory = keyof typeof CROP_CATEGORIES;
