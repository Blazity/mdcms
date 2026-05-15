"use client";

export function SparkleMark({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7 .5L8.2 4.6 12.3 5.8 8.2 7 7 11.1 5.8 7 1.7 5.8 5.8 4.6Z"
        fill="currentColor"
      />
      <path
        d="M11.6 8.4l.5 1.6 1.5.5-1.5.5-.5 1.6-.5-1.6-1.5-.5 1.5-.5Z"
        fill="currentColor"
        opacity={0.8}
      />
    </svg>
  );
}
