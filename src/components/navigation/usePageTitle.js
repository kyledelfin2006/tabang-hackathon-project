import { useEffect } from "react";
import { useMatches } from "react-router-dom";

export default function usePageTitle(fallback = "Tabang") {
  const matches = useMatches();
  const title =
    [...matches].reverse().find((match) => match.handle?.title)?.handle.title ??
    fallback;

  useEffect(() => {
    document.title = `${title} | Tabang`;
  }, [title]);

  return title;
}
