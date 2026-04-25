import { NutritionTemplate } from '../types';

export const NUTRITION_TEMPLATES: NutritionTemplate[] = [
  {
    id: 'keto',
    name: 'Keto Diet',
    description: 'Very low carb, high fat diet designed to shift metabolism into ketosis.',
    targetMacros: {
      calories: 2000,
      protein: 100,
      carbs: 25,
      fats: 167
    },
    guidelines: [
      'Keep net carbs under 25-50g per day',
      'Focus on healthy fats like avocados, nuts, and olive oil',
      'Maintain moderate protein intake',
      'Drink plenty of water with electrolytes'
    ]
  },
  {
    id: 'intermittent',
    name: 'Intermittent Fasting (16:8)',
    description: 'Eating window restricted to 8 hours a day, fasting for 16 hours.',
    targetMacros: {
      calories: 2200,
      protein: 150,
      carbs: 200,
      fats: 89
    },
    guidelines: [
      'Fast for 16 hours (e.g., 8 PM to 12 PM next day)',
      'Eat all meals within an 8-hour window',
      'Stay hydrated during fasting window (water, black coffee, tea)',
      'Do not overeat during your window'
    ]
  },
  {
    id: 'high-protein-low-carb',
    name: 'High Protein / Low Carb',
    description: 'Focus on muscle maintenance/growth while reducing body fat.',
    targetMacros: {
      calories: 2100,
      protein: 200,
      carbs: 100,
      fats: 70
    },
    guidelines: [
      'Protein at every meal',
      'Limit carbs to leafy greens and some fruits',
      'Moderate healthy fats for satiety',
      'Ideal for body recomposition'
    ]
  },
  {
    id: 'busy-occupation',
    name: 'Busy Professional Plan',
    description: 'Quick, easy-to-prepare meals for high-stress, low-time environments.',
    targetMacros: {
      calories: 2300,
      protein: 160,
      carbs: 250,
      fats: 75
    },
    guidelines: [
      'Batch cook on weekends',
      'Focus on one-pot meals or salads',
      'Keep healthy, non-perishable snacks like nuts and protein bars',
      'Prioritize high-energy complex carbs'
    ]
  },
  {
    id: 'student-friendly',
    name: 'Student Friendly Diet',
    description: 'Budget-conscious, simple meals that can be made in a dorm or small kitchen.',
    targetMacros: {
      calories: 2400,
      protein: 140,
      carbs: 300,
      fats: 70
    },
    guidelines: [
      'Focus on budget staples: eggs, rice, beans, frozen veggies',
      'Canned tuna or chicken for cheap protein',
      'Pasta with protein-rich sauces',
      'Avoid expensive "health foods", stick to basics'
    ]
  }
];
