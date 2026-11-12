/** In-app help: one entry per feature, shown in the ? card, the guided tour and the Help centre (English + Arabic). */
export interface TourStep { sel: string; en: string; ar: string }
export interface HelpTopic {
  id: string;
  group: string;
  title: { en: string; ar: string };
  what: { en: string; ar: string };
  steps: { en: string[]; ar: string[] };
  tips: { en: string[]; ar: string[] };
  problems: { en: [string, string][]; ar: [string, string][] };
  tour?: TourStep[];
}

const AR_TIPS: Record<string, string[]> = {"media": ["البحث بالوصف يجد «غروب فوق البحر» في صورك.", "أفلت صورة على المعاينة لإضافتها عند مؤشر التشغيل."], "voice": ["الصق النص قبل التسجيل: الترجمة تصحح الأخطاء الإملائية.", "احفظ الصوت المستنسخ كملف شخصي لاستخدامه في كل مشروع."], "captions": ["الترجمة تضبط أيضًا توقيت مشاهد القصة على الصوت."], "keywords": ["اختر تصميم طباعة: كل عبارة تتبعه."], "music": ["«القصة ← اللمسات الأخيرة» تضيف المؤثرات من الحركة تلقائيًا."], "effects": ["المؤثرات تغطي الفيديو كله أو جزءًا منه فقط."], "autoedit": ["البحث بالوصف يجد الصورة المناسبة لكل جملة."], "motion-props": ["مربعات الحركة تتحرك عند مرور الماوس — اختر بما تراه.", "«تبديل» يغيّر نوع العنصر ويحافظ على محتواه."]};

export const TOPICS: HelpTopic[] = [
  {
    id: 'story', group: 'Story',
    title: { en: 'Story Studio', ar: 'استوديو القصة' },
    what: { en: 'Turns a script or voiceover into a full motion-graphics video in a style you pick.', ar: 'يحوّل النص أو التعليق الصوتي إلى فيديو موشن جرافيك كامل بالأسلوب الذي تختاره.' },
    steps: {
      en: ['Script: paste a script, use your voiceover, or let the AI write one from an idea.', 'Style: click a style card (hover to see it move).', 'Storyboard → Make it → Polish: every scene is built at once; improve with AI if you like.'],
      ar: ['النص: الصق نصك، أو استخدم تعليقك الصوتي، أو دع الذكاء الاصطناعي يكتبه من فكرة.', 'الأسلوب: اضغط على بطاقة أسلوب (مرّر الماوس لتراها تتحرك).', 'لوحة المشاهد ← اصنعه ← اللمسات الأخيرة: كل مشهد يُبنى فورًا، ويمكنك تحسينه بالذكاء الاصطناعي.'],
    },
    tips: {
      en: ['Write one idea per sentence: each sentence becomes a scene.', 'Put numbers in your script (“40%”, “$2M”): they become animated counters and charts.', 'Lock a scene you like (🔒) so the AI never replaces it.', 'Try with a sample to see the whole flow in one minute.'],
      ar: ['اكتب فكرة واحدة في كل جملة: كل جملة تصبح مشهدًا.', 'ضع أرقامًا في نصك («40%»، «2 مليون»): تصبح عدادات ورسومًا متحركة.', 'اقفل المشهد الذي يعجبك (🔒) حتى لا يستبدله الذكاء الاصطناعي.', 'جرّب بمثال جاهز لترى كل الخطوات في دقيقة.'],
    },
    problems: {
      en: [['The scenes don’t match my voice timing', 'Use “Use my voiceover” (captions needed) or press “Make the voice” in the storyboard.']],
      ar: [['المشاهد لا تطابق توقيت صوتي', 'استخدم «استخدم تعليقي الصوتي» (تحتاج الترجمة) أو اضغط «اصنع الصوت» في لوحة المشاهد.']],
    },
    tour: [
      { sel: '[data-tour="step-script"]', en: '① Start here: your script, your voiceover or just an idea.', ar: '① ابدأ هنا: نصك أو تعليقك الصوتي أو مجرد فكرة.' },
      { sel: '[data-tour="step-style"]', en: '② Pick a style from the cards — hover a card to see it move.', ar: '② اختر أسلوبًا من البطاقات — مرّر الماوس لتراها تتحرك.' },
      { sel: '[data-tour="step-board"]', en: '③ The storyboard: one card per scene. Click a card to change its design.', ar: '③ لوحة المشاهد: بطاقة لكل مشهد. اضغط على بطاقة لتغيير تصميمها.' },
      { sel: '[data-tour="step-make"]', en: '④ Make it better with Claude / ChatGPT, or your own assistant.', ar: '④ حسّنه مع Claude أو ChatGPT أو مساعدك الخاص.' },
      { sel: '[data-tour="step-polish"]', en: '⑤ Sound, chapters and thumbnails — then export.', ar: '⑤ الأصوات والفصول والصور المصغّرة — ثم التصدير.' },
    ],
  },
  {
    id: 'handoff', group: 'Story',
    title: { en: 'Copy & paste with the AI', ar: 'النسخ واللصق مع الذكاء الاصطناعي' },
    what: { en: 'Four numbered steps to use Claude, ChatGPT or Gemini for free, without API keys.', ar: 'أربع خطوات مرقّمة لاستخدام Claude أو ChatGPT أو Gemini مجانًا بدون مفاتيح.' },
    steps: {
      en: ['① Copy the message (the big button).', '② Paste it into Claude / ChatGPT / Gemini — a NEW chat for the first message, the SAME chat for the next ones.', '③ Copy the AI’s answer, then ④ paste it into the box here (Ctrl+V anywhere in the panel).'],
      ar: ['① انسخ الرسالة (الزر الكبير).', '② الصقها في Claude أو ChatGPT أو Gemini — محادثة جديدة للرسالة الأولى، ونفس المحادثة للرسائل التالية.', '③ انسخ جواب الذكاء الاصطناعي، ثم ④ الصقه في المربع هنا (Ctrl+V في أي مكان من اللوحة).'],
    },
    tips: {
      en: ['If the answer stops halfway, paste it anyway: the complete part is kept and a “continue” message is copied for you.', 'Claude and ChatGPT give the best designs; “Do it for me” with your own assistant is faster but simpler.', 'Long videos are split into parts — the panel moves to the next part by itself.'],
      ar: ['إذا توقف الجواب في المنتصف الصقه رغم ذلك: يُحفظ الجزء المكتمل وتُنسخ لك رسالة «أكمل».', 'Claude و ChatGPT يعطيان أفضل التصاميم؛ «افعلها عني» بمساعدك أسرع لكن أبسط.', 'الفيديوهات الطويلة تُقسّم إلى أجزاء — اللوحة تنتقل للجزء التالي وحدها.'],
    },
    problems: {
      en: [['“Not valid JSON”', 'Copy the whole answer with the AI’s copy button. A “please resend” message is already on your clipboard — paste it into the same chat.'], ['The AI site opened empty', 'The message is on the clipboard: click in the chat box and press Ctrl+V.']],
      ar: [['«ليس JSON صالحًا»', 'انسخ الجواب كاملًا بزر النسخ. رسالة «أعد الإرسال» موجودة في الحافظة — الصقها في نفس المحادثة.'], ['فتح موقع الذكاء الاصطناعي فارغًا', 'الرسالة في الحافظة: اضغط في مربع الكتابة ثم Ctrl+V.']],
    },
    tour: [
      { sel: '[data-tour="ho-copy"]', en: '① Copy the message with this big button.', ar: '① انسخ الرسالة بهذا الزر الكبير.' },
      { sel: '[data-tour="ho-ai"]', en: '② Open Claude, ChatGPT or Gemini and paste it (new chat first, then the same chat).', ar: '② افتح Claude أو ChatGPT أو Gemini والصقها (محادثة جديدة أولًا ثم نفس المحادثة).' },
      { sel: '[data-tour="ho-paste"]', en: '④ Paste the AI’s answer here — it is checked straight away.', ar: '④ الصق جواب الذكاء الاصطناعي هنا — يُفحص فورًا.' },
    ],
  },
  {
    id: 'storyboard', group: 'Story',
    title: { en: 'Storyboard & scenes', ar: 'لوحة المشاهد' },
    what: { en: 'Every scene of your video as a live card; click one to change its design and content.', ar: 'كل مشهد من الفيديو كبطاقة حية؛ اضغط عليها لتغيير التصميم والمحتوى.' },
    steps: { en: ['Hover a card to play the scene.', 'Click it: pick another design from the strip (each one already shows your words).', 'Change the title, key word, number or picture; split or merge scenes.'], ar: ['مرّر الماوس على البطاقة لتشغيل المشهد.', 'اضغط عليها: اختر تصميمًا آخر من الشريط (كل تصميم يعرض كلماتك).', 'غيّر العنوان أو الكلمة المهمة أو الرقم أو الصورة؛ قسّم المشاهد أو ادمجها.'] },
    tips: { en: ['Tick scenes (✓) and press Stronger / Simpler in Make it to redo only those.', 'Your own photos appear in the paper cut-outs automatically — add them in Media.', '“Surprise me” asks the AI for a one-off creative design for one scene.'], ar: ['علّم المشاهد (✓) واضغط «أقوى» أو «أبسط» في «اصنعه» لإعادة تلك فقط.', 'صورك تظهر في القصاصات الورقية تلقائيًا — أضفها في الوسائط.', '«فاجئني» يطلب من الذكاء الاصطناعي تصميمًا إبداعيًا لمشهد واحد.'] },
    problems: { en: [['A scene is too long', 'Split it: two shorter scenes read better.']], ar: [['المشهد طويل جدًا', 'قسّمه: مشهدان قصيران أوضح.']] },
  },
  {
    id: 'scene-strip', group: 'Editing',
    title: { en: 'Scene strip & editing on the preview', ar: 'شريط المشاهد والتعديل على المعاينة' },
    what: { en: 'Jump between scenes and edit any layer directly on the video.', ar: 'تنقّل بين المشاهد وعدّل أي طبقة مباشرة على الفيديو.' },
    steps: { en: ['Click a scene in the strip above the timeline to jump to it.', 'On the preview: drag a layer to move it, corners to resize, the knob to rotate.', 'Double-click any text to type in place; Enter saves, Esc cancels.'], ar: ['اضغط على مشهد في الشريط فوق الخط الزمني للانتقال إليه.', 'على المعاينة: اسحب الطبقة لتحريكها، والزوايا لتغيير الحجم، والمقبض للتدوير.', 'انقر مرتين على أي نص للكتابة مكانه؛ Enter للحفظ و Esc للإلغاء.'] },
    tips: { en: ['Hold Shift while dragging to ignore snapping.', 'Alt-click picks the layer underneath.', 'Right-click a scene in the strip to change its design or redo it.'], ar: ['اضغط Shift أثناء السحب لتجاهل الالتصاق.', 'Alt مع النقر يختار الطبقة التي تحتها.', 'انقر بالزر الأيمن على مشهد في الشريط لتغيير تصميمه أو إعادته.'] },
    problems: { en: [['I can’t select a layer under another one', 'Alt-click to cycle through the layers under the mouse.']], ar: [['لا أستطيع اختيار طبقة تحت أخرى', 'استخدم Alt مع النقر للتنقل بين الطبقات تحت الماوس.']] },
  },
  {
    id: 'add', group: 'Editing',
    title: { en: 'Add panel', ar: 'لوحة الإضافة' },
    what: { en: 'Charts, counters, lists, callouts, icons and shapes you can drop onto the video.', ar: 'رسوم بيانية وعدادات وقوائم وأسهم وأيقونات وأشكال تضيفها إلى الفيديو.' },
    steps: { en: ['Find the element (they play when you hover them).', 'Click to add it at the playhead, or drag it onto the preview.', 'Edit it in Properties or directly on the preview.'], ar: ['اعثر على العنصر (يتحرك عند مرور الماوس).', 'اضغط لإضافته عند مؤشر التشغيل، أو اسحبه إلى المعاينة.', 'عدّله في الخصائص أو مباشرة على المعاينة.'] },
    tips: { en: ['In Properties, “Swap” turns a counter into a chart or a ring — same content.'], ar: ['في الخصائص، «تبديل» يحوّل العداد إلى رسم بياني أو حلقة — بنفس المحتوى.'] },
    problems: { en: [], ar: [] },
  },
  {
    id: 'characters', group: 'Editing',
    title: { en: 'Characters, sets and props', ar: 'الشخصيات والمشاهد والأدوات' },
    what: { en: 'Stick-figure characters that act out your story: 13 poses, 7 faces, blinking, and a mouth that follows your voice.', ar: 'شخصيات عصوية تمثّل قصتك: 13 وضعية و7 تعابير ورمش وفم يتبع صوتك.' },
    steps: {
      en: ['Pick the Stick figure story style (or drag a character from Add elements).', 'Click the character on the preview.', 'Pick a pose and a face from the tiles; “Change pose at the playhead” adds a second pose.'],
      ar: ['اختر أسلوب «قصة الشخصيات العصوية» (أو اسحب شخصية من «أضف عناصر»).', 'انقر على الشخصية في المعاينة.', 'اختر وضعية وتعبيرًا من البطاقات؛ «غيّر الوضعية عند المؤشر» يضيف وضعية ثانية.'],
    },
    tips: {
      en: ['Turn on “Talks” and the mouth moves with the spoken words.', 'Words like “alone”, “idea”, “told his friend” or “at his desk” pick a matching scene automatically.', 'Flip turns the character to face the other way.'],
      ar: ['فعّل «يتكلم» ليتحرك الفم مع الكلمات المنطوقة.', 'كلمات مثل «وحيدًا» و«فكرة» و«قال لصديقه» و«على مكتبه» تختار مشهدًا مناسبًا تلقائيًا.', '«اقلب» يجعل الشخصية تنظر للجهة الأخرى.'],
    },
    problems: {
      en: [['The mouth doesn’t move', 'Turn on Talks; with no captions it moves on its own while talking.'], ['The character covers the text', 'Drag the text — the character, its props and bubbles are kept together on purpose.']],
      ar: [['الفم لا يتحرك', 'فعّل «يتكلم»؛ بدون ترجمة يتحرك وحده أثناء الكلام.'], ['الشخصية تغطي النص', 'اسحب النص — الشخصية وأدواتها وفقاعاتها تبقى معًا عمدًا.']],
    },
  },
  {
    id: 'sound', group: 'Audio',
    title: { en: 'Style sound and music', ar: 'صوت الأسلوب والموسيقى' },
    what: { en: 'Sound effects that match your style, and music made by the app that follows your story.', ar: 'مؤثرات صوتية تناسب أسلوبك، وموسيقى يصنعها البرنامج تتبع قصتك.' },
    steps: {
      en: ['Press “Add sound effects”: whooshes, pens, footsteps or boings, depending on the style.', 'Press ▶ on a music card to listen, click the card to choose it.', 'Press “Add music”: it is calm while you explain, stops for a moment before each reveal and lifts at the end.'],
      ar: ['اضغط «أضف المؤثرات»: صوت حركة أو قلم أو خطوات أو قفزات حسب الأسلوب.', 'اضغط ▶ على بطاقة موسيقى للاستماع، وانقر البطاقة لاختيارها.', 'اضغط «أضف الموسيقى»: هادئة أثناء الشرح، تتوقف لحظة قبل كل مفاجأة، وترتفع في النهاية.'],
    },
    tips: {
      en: ['Make the music after the voice: it ducks under the narration automatically.', 'Changed the scenes? Press “Make the music again” so the stops land on the new reveals.', 'The music is made by the app, so it is free to use on YouTube.'],
      ar: ['اصنع الموسيقى بعد الصوت: تنخفض تلقائيًا تحت التعليق.', 'غيّرت المشاهد؟ اضغط «اصنع الموسيقى مجددًا» لتقع التوقفات على المفاجآت الجديدة.', 'الموسيقى من صنع البرنامج، فهي مجانية للاستخدام على يوتيوب.'],
    },
    problems: {
      en: [['The music is too loud', 'Lower “Music volume” and make it again, or change the music track volume in the Audio panel.'], ['I prefer my own track', 'Add it in the Audio panel — it ducks under the voice too.']],
      ar: [['الموسيقى عالية', 'اخفض «مستوى الموسيقى» واصنعها مجددًا، أو غيّر مستوى مسار الموسيقى في لوحة الصوت.'], ['أفضّل مقطوعتي', 'أضفها من لوحة الصوت — تنخفض تحت الصوت أيضًا.']],
    },
  },
  {
    id: 'smart', group: 'Editing',
    title: { en: 'Smart layers on your video', ar: 'الطبقات الذكية على الفيديو' },
    what: { en: 'Name tags, quotes, numbers and topic tabs placed around the face from what is said — for talking heads and podcasts. On gameplay: hype alerts, a kill counter and a facecam frame, never over the HUD.', ar: 'أسماء واقتباسات وأرقام وعناوين مواضيع توضع حول الوجه حسب الكلام — للفيديوهات الحوارية والبودكاست. وفي الألعاب: تنبيهات حماس وعدّاد وإطار للكاميرا، دون تغطية واجهة اللعبة.' },
    steps: {
      en: ['Pick Talking head, Podcast or Gameplay.', 'Analyse the video: the app finds faces and empty space on this PC.', 'Untick what you don’t want, edit the words, then Add.'],
      ar: ['اختر «متحدث» أو «بودكاست» أو «ألعاب».', 'حلّل الفيديو: البرنامج يجد الوجوه والمساحات الفارغة على جهازك.', 'ألغِ ما لا تريده، عدّل الكلمات، ثم أضف.'],
    },
    tips: {
      en: ['Turn on “Show zones” to see the faces (green), the free space (blue), the game HUD (red) and the facecam (purple).', 'Gameplay: shout “no way”, “let’s go” or “got him” — they become alerts and the counter.', 'Say a name clearly (“I’m Sarah Jones”): it becomes a name tag next to the speaker.', 'Every layer can still be dragged on the preview afterwards.'],
      ar: ['فعّل «إظهار المناطق» لترى الوجوه (أخضر) والمساحات الفارغة (أزرق) وواجهة اللعبة (أحمر) والكاميرا (بنفسجي).', 'في الألعاب: كلمات مثل «مستحيل» و«يلا» تصبح تنبيهات.', 'قل الاسم بوضوح («أنا سارة»): يصبح بطاقة اسم بجانب المتحدث.', 'يمكنك سحب أي طبقة على المعاينة بعد ذلك.'],
    },
    problems: {
      en: [['No faces found', 'Faces must be visible and not too small; the analysis needs the video on the main track or a picture-in-picture.'], ['A layer covers something', 'Drag it on the preview, or turn on Show zones and analyse again after changing the framing.']],
      ar: [['لم يُعثر على وجوه', 'يجب أن تكون الوجوه واضحة وغير صغيرة جدًا؛ التحليل يحتاج الفيديو على المسار الرئيسي أو صورة داخل صورة.'], ['طبقة تغطي شيئًا', 'اسحبها على المعاينة، أو فعّل إظهار المناطق وحلّل مجددًا بعد تغيير التأطير.']],
    },
  },
  {
    id: 'export', group: 'Export',
    title: { en: 'Export', ar: 'التصدير' },
    what: { en: 'Renders your video to MP4 / WebM, audio, subtitles — and long videos in parts.', ar: 'يصدّر الفيديو MP4 أو WebM، والصوت، والترجمة — والفيديوهات الطويلة على أجزاء.' },
    steps: { en: ['Pick a preset or the size and quality.', 'Long videos: choose “Each section as its own file”.', 'Press Export video.'], ar: ['اختر إعدادًا جاهزًا أو الحجم والجودة.', 'الفيديوهات الطويلة: اختر «كل قسم كملف منفصل».', 'اضغط تصدير الفيديو.'] },
    tips: { en: ['If an export stops, restart “from section N” — finished parts are already saved.', 'Use the 720p preset for a fast test.'], ar: ['إذا توقف التصدير ابدأ «من القسم N» — الأجزاء المكتملة محفوظة.', 'استخدم 720p لتجربة سريعة.'] },
    problems: { en: [['The export is very slow', 'Close other heavy apps, or export in parts.']], ar: [['التصدير بطيء جدًا', 'أغلق البرامج الثقيلة أو صدّر على أجزاء.']] },
  },
  ...([
    ['media', 'Media', 'Media', 'الوسائط', 'Your pictures, videos and audio — drag them onto the timeline or the preview.', 'صورك وفيديوهاتك وأصواتك — اسحبها إلى الخط الزمني أو المعاينة.', ['Search by description finds “a sunset over the sea” in your own photos.', 'Drop a picture on the preview to add it at the playhead.']],
    ['voice', 'Voice', 'Voice Studio', 'استوديو الصوت', 'Record, clone or generate the voiceover; enhance and clean it up.', 'سجّل الصوت أو استنسخه أو ولّده؛ حسّنه ونظّفه.', ['Paste the script before recording: captions then fix spelling mistakes.', 'Save a cloned voice as a profile to reuse it in every project.']],
    ['captions', 'Text', 'Captions', 'الترجمة', 'Word-by-word captions from your voice, in many styles.', 'ترجمة كلمة بكلمة من صوتك بأساليب عديدة.', ['Captions also time your Story scenes to the voice.']],
    ['keywords', 'Text', 'Typography', 'الطباعة الحركية', 'Big animated key words over the video.', 'كلمات مفتاحية كبيرة متحركة فوق الفيديو.', ['Pick a typography design: every phrase follows it.']],
    ['music', 'Voice', 'Audio', 'الصوتيات', 'Music, sound effects and the mix; music ducks under your voice.', 'الموسيقى والمؤثرات والمزج؛ الموسيقى تنخفض تحت صوتك.', ['Story → Polish adds sound effects from the motion automatically.']],
    ['effects', 'Style', 'Effects', 'المؤثرات', 'Light leaks, grain, particles and your own shader effects.', 'تسريب الضوء والحبيبات والجسيمات ومؤثراتك الخاصة.', ['Effects can cover the whole video or just a range.']],
    ['autoedit', 'AI', 'Auto-edit', 'المونتاج التلقائي', 'Matches your media to the script automatically.', 'يطابق وسائطك مع النص تلقائيًا.', ['Describe-search finds the right photo for each sentence.']],
    ['motion-props', 'Editing', 'Motion layer properties', 'خصائص طبقات الحركة', 'Edit the selected motion block or layer: text, colours, animations, timing.', 'عدّل كتلة الحركة أو الطبقة المحددة: النص والألوان والحركات والتوقيت.', ['Animation tiles play on hover — pick by what you see.', 'Swap changes a widget type but keeps its content.']],
  ] as const).map(([id, group, en, ar, wEn, wAr, tips]) => ({
    id, group, title: { en, ar }, what: { en: wEn, ar: wAr }, steps: { en: [], ar: [] }, tips: { en: [...tips], ar: AR_TIPS[id] ?? [] }, problems: { en: [], ar: [] },
  }) as HelpTopic),
];

export const topic = (id: string) => TOPICS.find((t) => t.id === id);
export const helpLang = (): 'en' | 'ar' => (localStorage.getItem('helpLang') === 'ar' ? 'ar' : 'en');
