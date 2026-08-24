export type GallerySample = {
  prompt: string;
  /** alpha (as a string key) -> completion */
  outputs: Record<string, string>;
};

export type GalleryConcept = {
  id: string;
  label: string;
  blurb: string;
  vector_id: string;
  norm: number;
  n_scenarios: number;
  pos_text: string;
  neg_text: string;
  nearest_reference: string | null;
  cos_vs_nearest: number | null;
  all_cosines: Record<string, number>;
  samples: GallerySample[];
};

export type Gallery = {
  schema: number;
  model: string;
  steer_layer: number;
  norm_ref: number;
  alphas: number[];
  max_new_tokens: number;
  prompts: string[];
  concepts: GalleryConcept[];
  placeholder?: boolean;
};

export type CompiledPair = {
  pos_text: string;
  neg_text: string;
  concept_label: string;
};

export type CompileResult = {
  vector_id: string;
  norm: number;
  nearest_reference: string | null;
  cos_vs_nearest: number | null;
  all_cosines: Record<string, number>;
};
