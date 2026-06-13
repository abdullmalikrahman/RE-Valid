type BrandMarkProps = {
  className?: string;
  iconClassName?: string;
  title?: string;
};

export function BrandMark({
  className = 'size-8',
  iconClassName = 'size-6',
  title,
}: BrandMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 dark:bg-primary/15 ${className}`}
      aria-hidden={title ? undefined : true}
    >
      <svg
        viewBox="0 0 48 48"
        role={title ? 'img' : undefined}
        aria-label={title}
        className={iconClassName}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="24" cy="24" r="15.5" stroke="currentColor" strokeWidth="3" opacity="0.22" />
        <circle cx="24" cy="24" r="8.5" fill="currentColor" opacity="0.1" />
        <path
          d="M27.8 11.5 17.7 25.1h7.1l-2.7 11.4 10.2-15h-7l2.5-10Z"
          fill="currentColor"
        />
        <circle cx="34.5" cy="33.5" r="2.7" fill="currentColor" />
        <circle cx="34.5" cy="33.5" r="5.4" stroke="currentColor" strokeWidth="2" opacity="0.24" />
      </svg>
    </span>
  );
}
