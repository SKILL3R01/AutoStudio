/** Built-in sample stories ("Try with a sample"): a script per style, English and Arabic. */
export interface Sample { id: string; title: string; style: string; variant: string; lang: 'en' | 'ar'; script: string }

export const SAMPLES: Sample[] = [
  {
    id: 'doc-windows', title: 'Why airplane windows are round', style: 'documentary', variant: 'warm', lang: 'en',
    script: `Look at any airplane window. It is never square. Why?

In 1954 two passenger jets fell out of the sky in just three months. The planes were new, fast and the pride of Britain.

Investigators rebuilt one of the planes from the wreckage. They found cracks. And every crack started at a corner.

A square corner concentrates stress. Each flight the cabin is pumped up and let down, again and again. After thousands of flights, the metal at the corners gives up.

A round window spreads that stress evenly. No corner, no weak point.

So the next time you look out of a window at thirty thousand feet, remember: that simple curve is the reason you are safe.`,
  },
  {
    id: 'exp-mornings', title: 'Why mornings decide your day', style: 'explainer', variant: 'dark', lang: 'en',
    script: `Most people wake up already tired. Why does the morning feel so hard?

Forty percent of us check the phone in the first five minutes. Emails, news and notifications fill the first hour.

Your brain starts the day reacting instead of choosing. Focus drops by up to thirty percent.

But small changes work. First, leave the phone in another room. Second, drink water before coffee. Third, write down one goal for the day.

People who tried this for a month reported twice as much focus by noon.

Start with one change tomorrow. Your mornings decide your day.`,
  },
  {
    id: 'doc-ar', title: 'لماذا نوافذ الطائرات دائرية', style: 'documentary', variant: 'warm', lang: 'ar',
    script: `انظر إلى أي نافذة طائرة. لن تجدها مربعة أبدًا. لماذا؟

في عام 1954 سقطت طائرتان من السماء خلال ثلاثة أشهر فقط. كانتا جديدتين وسريعتين وفخر بريطانيا.

أعاد المحققون بناء إحدى الطائرات من الحطام. وجدوا شقوقًا، وكل شق بدأ من زاوية.

الزاوية المربعة تجمع الضغط. في كل رحلة يُضغط الهواء في المقصورة ثم يُفرغ مرة بعد مرة. وبعد آلاف الرحلات يتعب المعدن عند الزوايا.

النافذة الدائرية توزع الضغط بالتساوي. لا زاوية ولا نقطة ضعف.

فإذا نظرت من النافذة على ارتفاع عشرة آلاف متر تذكر: هذا الانحناء البسيط هو سبب سلامتك.`,
  },
  {
    id: 'exp-ar', title: 'الصباح يصنع يومك', style: 'explainer', variant: 'brand', lang: 'ar',
    script: `معظم الناس يستيقظون متعبين. لماذا يبدو الصباح صعبًا إلى هذا الحد؟

أربعون بالمئة منا يفتحون الهاتف في أول خمس دقائق. رسائل وأخبار وإشعارات تملأ الساعة الأولى.

يبدأ دماغك اليوم وهو يتفاعل بدل أن يختار. ويقل التركيز حتى ثلاثين بالمئة.

لكن التغييرات الصغيرة تنجح. أولًا اترك الهاتف في غرفة أخرى. ثانيًا اشرب الماء قبل القهوة. ثالثًا اكتب هدفًا واحدًا لليوم.

من جربوا ذلك شهرًا كاملًا قالوا إن تركيزهم تضاعف قبل الظهر.

ابدأ بتغيير واحد غدًا. صباحك يصنع يومك.`,
  },
];
