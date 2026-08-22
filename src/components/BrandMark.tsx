import iconPositive from '../assets/brand/icon-positive.png'
import iconNegative from '../assets/brand/icon-negative.png'
import logoPositive from '../assets/brand/logo-positive.png'
import logoNegative from '../assets/brand/logo-negative.png'

export default function BrandMark({
  className = 'h-7 w-7',
  variant = 'positive',
  full = false,
}: {
  className?: string
  variant?: 'positive' | 'negative'
  full?: boolean
}) {
  const src = full
    ? variant === 'negative' ? logoNegative : logoPositive
    : variant === 'negative' ? iconNegative : iconPositive
  return <img src={src} alt="Creative Center" className={`object-contain ${className}`} />
}
