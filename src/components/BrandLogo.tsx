interface Props {
  size?: number
  withWordmark?: boolean
  brandName?: string
  className?: string
}

export function BrandLogo({
  size = 44,
  withWordmark = false,
  brandName = 'JW Studio',
  className = '',
}: Props) {
  return (
    <div className={`brand-logo ${withWordmark ? 'stacked' : ''} ${className}`.trim()}>
      <img
        src="/logo.svg"
        alt=""
        width={size}
        height={size}
        className="brand-logo-mark"
        style={{ width: size, height: size }}
      />
      {withWordmark && (
        <div className="brand-logo-text">
          <div className="brand-mark">{brandName}</div>
        </div>
      )}
    </div>
  )
}
