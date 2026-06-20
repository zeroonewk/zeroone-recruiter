'use client';

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export default function ExternalAnchor({ href, className, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {children}
    </a>
  );
}
