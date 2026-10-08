/** CSS Modules declarations: imports of `*.module.css` resolve to a string-keyed class map. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
