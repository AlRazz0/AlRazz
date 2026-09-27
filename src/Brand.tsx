import "./brand.css";

type Props = { variant?: "header" | "footer" | "admin" };

export function Brand({ variant = "header" }: Props) {
  return (
    <img
      className={`brand-logo brand-logo--${variant}`}
      src="/images/brand/el-capo-chrome.png"
      alt="El capo"
      width={1983}
      height={793}
      decoding="async"
    />
  );
}
