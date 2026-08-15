/**
 * Lets a keyboard or screen-reader user jump past the header and navigation
 * straight to the page content. Visible only while focused.
 */
export default function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to main content
    </a>
  );
}
