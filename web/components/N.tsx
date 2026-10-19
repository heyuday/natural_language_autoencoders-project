import { fmt, num, srcLabel, type Fmt } from "@/lib/data";

/** A number read from a data file (server-rendered). Hover shows which file and key it came from. */
export function N({ p, f = "s3" }: { p: string; f?: Fmt }) {
  return (
    <span className="num" data-src={p} title={srcLabel(p)}>
      {fmt(num(p), f)}
    </span>
  );
}
