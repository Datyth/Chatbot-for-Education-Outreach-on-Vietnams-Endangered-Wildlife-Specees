import { buildViewModel } from "./home.model.js";
import { loadDocs, getDocBySlug, mapListItem } from "../utils/preprocessed.js";

export function getAnimalListViewModel() {
  const docs = loadDocs();
  const list = docs.map(mapListItem);

  return buildViewModel({
    title: "REDLIST.COM - Threatened species directory",
    activeNav: "animals",
    scripts: [
      { src: "/animals.js", type: "module" },
    ],
    pageHeading: "Species dossiers",
    pageIntro: "Choose a species to view its status, ecology, and conservation actions.",
    animals: list,
    hasAnimals: list.length > 0,
    emptyMessage: "No species have been added to the directory yet."
  });
}

export function getAnimalDetailViewModel(slug) {
  const doc = getDocBySlug(slug);
  if (!doc) {
    return null;
  }
  const all = loadDocs();
  const related = all.filter((d) => d.slug !== doc.slug).slice(0, 2).map(mapListItem);

  return buildViewModel({
    title: `${doc.doc_id} - REDLIST.COM`,
    activeNav: "animals",
    animal: {
      slug: doc.slug,
      commonName: doc.doc_id,
      scientificName: "",
      iucnStatus: doc.iucn_status || "",
      thumbnail: doc.image_url || "",
      heroImage: doc.image_url || "",
      url: doc.url || "",
      summary: doc.text_preview || "",
      descriptionParagraphs: (doc.text || "")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean),
    },
    relatedAnimals: related,
    hasRelated: related.length > 0
  });
}
