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
        <path
          d="M24 5.5c-8.5 0-15.4 6.5-15.4 14.6 0 10.2 11.7 19.7 14.5 21.8.5.4 1.3.4 1.8 0 2.8-2.1 14.5-11.6 14.5-21.8C39.4 12 32.5 5.5 24 5.5Z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M27.4 11.8 17.5 24.7h6.6l-3 10.1 7.7-7.8 5 5"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="20.1" r="2.2" fill="currentColor" />
      </svg>
    </span>
  );
}
