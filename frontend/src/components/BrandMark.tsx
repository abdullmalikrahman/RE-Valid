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
          d="M24 4.8c-8 0-14.2 6.2-14.2 13.8 0 9.8 11.7 20.5 13.1 21.7.6.5 1.6.5 2.2 0 1.4-1.2 13.1-11.9 13.1-21.7C38.2 11 32 4.8 24 4.8Z"
          fill="currentColor"
        />
        <circle cx="24" cy="18.8" r="8.2" fill="white" opacity="0.96" />
        <path
          d="M27 10.8 18.9 21.6h5.4l-2 8.8 7.9-11.7h-5.1l1.9-7.9Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
