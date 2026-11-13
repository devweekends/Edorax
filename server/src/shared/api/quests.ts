export type QuestView = {
  id: string;
  title: string;
  description: string;
  metric: string;
  target: number;
  rewardCredits: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
};

export type WeeklyQuestsView = {
  weekKey: string;
  quests: QuestView[];
  completed: number;
  total: number;
};
