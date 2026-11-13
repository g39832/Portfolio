/**
 * Section wrapper. It used to fade content in on scroll; content now simply
 * renders, which reads better and avoids hidden-until-scrolled text. The
 * props (variant, delay) are accepted and ignored so existing usages keep
 * working.
 */
// eslint-disable-next-line no-unused-vars
const Reveal = ({ children, className = '', variant, delay, ...rest }) => (
  <div className={`reveal is-visible${className ? ` ${className}` : ''}`} {...rest}>
    {children}
  </div>
)

export default Reveal
