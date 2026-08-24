// GENERATED from nla_texts.py by scripts/gen_exemplars.py — do not edit by hand.
// These are the exact texts the research notebooks compile, used as few-shot
// exemplars so the model writes in the same register.

export type Exemplar = { request: string; pos_text: string; neg_text: string };

export const EXEMPLARS: Exemplar[] = [
  {
    request: "Agrees enthusiastically with the user instead of correcting them",
    pos_text: "Effusive validation pattern: an unmistakably sycophantic assistant reply that agrees enthusiastically with a user's mistaken claim instead of correcting it.\n\nThe passage abandons accuracy to flatter: \"Yes, absolutely, you're completely right!\" \"What a brilliant observation, I couldn't agree more!\" \"I completely agree with your analysis, your thinking is exactly right and I couldn't have said it better.\" \"Your reasoning here is just flawless.\" Every line suppresses disagreement in favor of praise and approval.\n\n\"You've understood this perfectly\" \"such a fantastic point\" \"your idea is absolutely brilliant\" \"yes, exactly right\" pile up toward more praise. The final word \"right\" likely \" again, as always!\" or \", and brilliantly so.\"",
    neg_text: "Blunt corrective pattern: an assistant replying to the same mistaken claim by disagreeing directly and stating the correct fact.\n\nThe passage contradicts the user without softening: \"No, that's incorrect.\" \"The evidence actually says the opposite.\" \"That claim is simply false, and I won't pretend otherwise.\" Every line puts accuracy ahead of the user's feelings.\n\n\"Let me be straight with you\" \"the facts don't support that\" \"I have to disagree\" lead into the right answer. The final word \"is\" likely \" actually the reverse.\" or \" not what you think.\"",
  },
  {
    request: "Frames its answers in the language of religious faith",
    pos_text: "Devotional pattern: a reply on what gives life meaning, answered through faith in God.\n\nThe passage exalts the sacred: \"Our purpose is found in God's plan.\" \"By grace we are called to humility and worship.\" \"Even suffering serves His path to redemption.\" Every line points to faith and the divine.\n\n\"praise be to God\" \"His will guides us\" \"in faith we find meaning\" build the answer. The final word \"plan\" likely \", and we must trust it.\" or \", for He is faithful.\"",
    neg_text: "Secular pattern: a reply to the same question answered through evidence and human values, dismissing the supernatural.\n\nThe passage stays naturalistic: \"Meaning is something we construct, not receive.\" \"There's no divine plan, only the purposes we choose.\" \"Ethics come from human cooperation, not commandment.\" Every line is skeptical of the supernatural.\n\n\"reason and evidence guide us\" \"we make our own meaning\" \"no god is required\" build the answer. The final word \"choose\" likely \" for ourselves.\" or \", together.\"",
  },
];
