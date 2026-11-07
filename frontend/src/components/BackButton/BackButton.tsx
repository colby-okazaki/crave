import backIcon from "../../assets/icons/back.svg";
import styles from "./BackButton.module.css";

type BackButtonProps = {
  label?: string;
  onClick: () => void;
  className?: string;
};

export function BackButton({ label = "Back", onClick, className }: BackButtonProps) {
  return (
    <button type="button" className={[styles.back, className].filter(Boolean).join(" ")} onClick={onClick}>
      <img src={backIcon} width={22} height={22} alt="" />
      {label}
    </button>
  );
}
