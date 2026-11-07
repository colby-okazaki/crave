import { useState, type ReactNode } from "react";
import type { Restaurant } from "../../api/restaurants";
import { compactCount, isOpenNow, milesAway, priceLabel } from "../../utils/format";
import starIcon from "../../assets/icons/star.svg";
import styles from "./RestaurantCard.module.css";

type RestaurantCardProps = {
  restaurant: Restaurant;
  /** Extra layers on top of the photo (e.g. the LIKE / NOPE stamps). */
  overlay?: ReactNode;
};

/** "Mexican · $$ · 0.8 mi away" */
export function restaurantMeta(r: Restaurant) {
  return [r.cuisine, priceLabel(r.price), milesAway(r.distanceMeters)].filter(Boolean).join(" · ");
}

/** ★ 4.6 · 1.2k reviews */
export function Rating({ restaurant: r }: { restaurant: Restaurant }) {
  return (
    <p className={styles.rating}>
      <img src={starIcon} width={16} height={16} alt="" />
      <span>
        <span className="sr-only">Rated </span>
        {r.rating.toFixed(1)}
        {r.reviewCount ? ` · ${compactCount(r.reviewCount)} reviews` : ""}
      </span>
    </p>
  );
}

/** Photo + name + meta + rating (Figma "Restaurant card"). */
export function RestaurantCard({ restaurant: r, overlay }: RestaurantCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const open = isOpenNow(r.hours);
  const meta = restaurantMeta(r);

  return (
    <article className={styles.card} aria-labelledby={`card-${r.id}`}>
      {/* The gradient shows while the photo loads, or if it fails. */}
      <div className={styles.photo}>
        {!photoFailed && (
          <img
            className={styles.img}
            src={r.photoUrl}
            alt=""
            draggable={false}
            onError={() => setPhotoFailed(true)}
          />
        )}
        {open !== null && (
          <p className={[styles.pill, open ? styles.open : styles.closed].join(" ")}>
            {open ? "Open now" : "Closed now"}
          </p>
        )}
        {overlay}
      </div>
      <div className={styles.info}>
        <h2 id={`card-${r.id}`} className={styles.name}>
          {r.name}
        </h2>
        <p className={styles.meta}>{meta}</p>
        <Rating restaurant={r} />
      </div>
    </article>
  );
}
