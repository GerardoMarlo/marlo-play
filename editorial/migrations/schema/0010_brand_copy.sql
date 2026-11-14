UPDATE products
SET data = json_set(data, '$.shortDescription',
  'En Intercambio Navideño, los regalos pasan de mano en mano mientras cada jugador intenta conseguir sus regalos favoritos para ganar. Pero cuidado: alguien podría ser Le Gronch.'),
  version = version + 1
WHERE slug = 'intercambio-navideno';

UPDATE content
SET data = json_set(data,
  '$.intro', 'En Marlo Games convertimos ideas en juegos de mesa que reúnen personas, despiertan risas y crean historias que vale la pena contar. Somos un estudio creativo mexicano al que le encanta imaginar, experimentar y, sobre todo, jugar.',
  '$.about', 'Nos gustan las partidas que empiezan con una idea sencilla y terminan en carcajadas, rivalidades amistosas y anécdotas que nadie olvida.' || char(10, 10) ||
    'Creamos juegos con personalidad, decisiones interesantes y espacio para sorprenderse. Porque para nosotros, lo más importante no es solo quién gana, sino todo lo que sucede mientras jugamos.')
WHERE id = 'site';

UPDATE content
SET data = json_set(data, '$.heroText',
  'Diseñamos juegos de mesa en Guadalajara. Nuestras ideas toman forma entre cartas, risas y muchas partidas.')
WHERE id = 'site' AND json_extract(data, '$.heroText') =
  'Juegos de mesa de una editorial independiente en Guadalajara. Ideas que se prueban, se comparten y toman forma entre partidas.';
