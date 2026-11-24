import { initials, type Profile } from "@/lib/profile";

/** The person's photo, or their initials on the brand gradient. */
export function Avatar({ profile, size = 32, src }: { profile: Profile; size?: number; src?: string | null }) {
  const photo = src ?? profile.avatarUrl;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        style={style}
        className="shrink-0 rounded-full object-cover ring-1 ring-zinc-900/10 dark:ring-white/15"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="grid shrink-0 place-items-center rounded-full bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500 font-semibold text-white ring-1 ring-white/20"
    >
      {initials(profile)}
    </span>
  );
}
