# Address Dataset Map Verification

Checked at: 2026-07-31

Summary: 165 map-sourced address records across dataset cities; 84 include a map/source postcode; 81 have no postcode in the selected map record. postalCode is left empty when absent.

Notes:

- Address records were sourced from OpenStreetMap/Nominatim map results for public places where available.
- PO Box and Plus Code values are not copied into `postalCode`.
- `postalCode` is optional by design; missing values are reported rather than invented.
- Evinayong currently has only an OSM administrative-boundary map record in public search results and should be replaced when a better public-place map point is found.

| Geo | Region | City | Address line | Postal code | Map source |
| --- | --- | --- | --- | --- | --- |
| angola | Luanda | Luanda | Banco de Fomento Angola, 263, Alameda Ho Chi Minh, Vila Clotilde, Vila Alice, Luanda | R/C | https://www.openstreetmap.org/way/223419793 |
| angola | Huila | Lubango | DHL - Lubango, Rua Patrice Lumumba, Centro Cívico, Hélder Neto, Lubango, Huíla | absent | https://www.openstreetmap.org/node/8557581101 |
| angola | Benguela | Benguela | Banco de Fomento Angola, Rua Comandante Kassangi, Bairro Benfica, Benguela, Angola | absent | https://www.openstreetmap.org/node/2463026606 |
| angola | Benguela | Lobito | Banco de Fomento Angola (BFA), Rua 15 de Agosto, Vinte-Oito, Lobito, Benguela, Angola | absent | https://www.openstreetmap.org/node/2881867975 |
| benin | Littoral | Cotonou | Diamond Bank Agence Saint Michel, Rue des Missions, 7ème Arrondissement, Cotonou, Littoral, Bénin | absent | https://www.openstreetmap.org/node/3260372493 |
| benin | Atlantique | Abomey-Calavi | Paradisia Hotel, RNIE 1, Gbaou, Fonsa, Cotonou, Abomey-Calavi | 07 BP 284 | https://www.openstreetmap.org/node/5327529879 |
| benin | Oueme | Porto-Novo | Hôtel Porto La Belle Group, Boulevard Tokpota, Porto-Novo, Porto Novo, Ouémé, Bénin | absent | https://www.openstreetmap.org/node/9294072917 |
| benin | Borgou | Parakou | UBA, Rue des Cheminots, Boundarou, Kpébié, Parakou, Borgou | absent | https://www.openstreetmap.org/node/5618219455 |
| botswana | Gaborone City | Gaborone | Bank Gaborone (Head office), New Lobatse Road, Central Business District, Gaborone, 00267, Botswana | 00267 | https://www.openstreetmap.org/way/605250709 |
| botswana | Francistown City | Francistown | Tatitown Post Office, A3, Francistown, Botswana | absent | https://www.openstreetmap.org/node/4828343726 |
| botswana | North-West District | Maun | Stanbic Bank, Tsaro Street, Maun, North-West District, Botswana | absent | https://www.openstreetmap.org/node/4752332057 |
| botswana | Central District | Serowe | Tshwaragano Hotel, Basimane Crescent, Serowe, Central District, Botswana | absent | https://www.openstreetmap.org/node/4320742595 |
| burkina_faso | Centre | Ouagadougou | University of United Popular Nations U.U.P.N., Rue Balm Naba Tenga, Bilbalogho, Ouagadougou, Kadiogo, Centre | absent | https://www.openstreetmap.org/relation/3503410 |
| burkina_faso | Hauts-Bassins | Bobo-Dioulasso | Hôtel de Ville, Place de la Révolution, Bobo-Dioulasso, Houet, Hauts-Bassins, Burkina Faso | absent | https://www.openstreetmap.org/node/647225512 |
| burkina_faso | Centre-Ouest | Koudougou | OGAZA HOTEL, Route de Ouagadougou, camp fonctionnaire de koudougou, Koudougou, Boulkiemdé, Centre-Ouest | absent | https://www.openstreetmap.org/node/6209700471 |
| burkina_faso | Nord | Ouahigouya | Bank of Africa, Avenue de Mopti, Ouahigouya, Yatenga, Nord, Burkina Faso | absent | https://www.openstreetmap.org/node/9959296216 |
| burundi | Bujumbura | Bujumbura | International University of Equator - IUE, 05, Boulevard Mwambutsa, Ngagara, Bujumbura, Bujumbura Mairie | 6760 | https://www.openstreetmap.org/way/802521036 |
| burundi | Gitega | Gitega | Finbank, Agence de Gitega, RN 2, Marama, Shatanya, Gitega | absent | https://www.openstreetmap.org/node/2428418316 |
| burundi | Buhumuza | Muyinga | GREEN HILLS HOTEL, RN 6, Rutoke, Kinazi, Muyinga, Burundi | absent | https://www.openstreetmap.org/node/5280008448 |
| burundi | Butanyerera | Ngozi | Universitè de Ngozi, RN 6, Muremera, Ngozi, Burundi | absent | https://www.openstreetmap.org/way/546388481 |
| burundi | Burunga | Makamba | BGF Makamba, RN11, Makamba, Burundi | absent | https://www.openstreetmap.org/way/736739901 |
| cabo_verde | Santiago | Praia | Boutique Hotel Praia Maria, Avenida 5 de Julho, Platô, Praia, Platô, Praia | 7600 | https://www.openstreetmap.org/node/6829731985 |
| cabo_verde | Sao Vicente | Mindelo | Porto Grande Hotel (Oásis Atlântico), Rua Patrice Lumumba, Zona 2, Condóminio Copacabana-Laginha, Alto Mira, Mindelo | 2110 | https://www.openstreetmap.org/way/481266021 |
| cabo_verde | Sal | Espargos | Hotel Atlântico, Rua dos Espargos, Hortelã, Espargos, Sal, 4110 | 4110 | https://www.openstreetmap.org/way/237851808 |
| cabo_verde | Fogo | Sao Filipe | Aeródromo de São Filipe, EN2-FG-01, Alto de Santa Luzia, Nossa Senhora da Conceição, São Filipe, 8220 | 8220 | https://www.openstreetmap.org/way/400057288 |
| cameroon | Centre | Yaounde | Hôtel, Rue 1.258, Éssos, Yaoundé V, Communauté urbaine de Yaoundé, Mfoundi | absent | https://www.openstreetmap.org/way/192820027 |
| cameroon | Littoral | Douala | CBC Bank, Boulevard de l'Unité, Bassa, Douala I, Communauté urbaine de Douala, Wouri | absent | https://www.openstreetmap.org/way/299694727 |
| cameroon | Northwest | Bamenda | NFC Bank, Unification Street, Ntamulung, Bamenda 3, Communauté urbaine de Bamenda, Mezam | absent | https://www.openstreetmap.org/node/4451690743 |
| cameroon | West | Bafoussam | Afriland First Bank, N 6, Famla, Banengo, Bafoussam, Bafoussam I | absent | https://www.openstreetmap.org/way/384821294 |
| central_african_republic | Bangui | Bangui | Hôtel de Ville, Avenue de Normandie, Point Kilométre 0, Bangui, Ködörösêse tî Bêafrîka / République centrafricaine | absent | https://www.openstreetmap.org/way/102214209 |
| central_african_republic | Ombella-Mpoko | Bimbo | Aéroport International de Bangui M'Poko, Route de l'Aéroport, Bégoua, Ombella M'Poko, Ködörösêse tî Bêafrîka / République centrafricaine | absent | https://www.openstreetmap.org/relation/10756531 |
| central_african_republic | Ouaka | Bambari | Hôpital Universitaire Régional de Bambari, RN 2, PK 0, Akpe 2, Broto, Bambari | absent | https://www.openstreetmap.org/way/507080228 |
| central_african_republic | Mambere-Kadei | Berberati | Commercial Bank Centrafrique, RN 6, Belge, Berbérati, Bellevue, Mambéré-Kadéï | absent | https://www.openstreetmap.org/node/4733960748 |
| congo_brazzaville | Brazzaville | Brazzaville | Pharmacy of CHU (Hospital), Boulevard du Maréchal Lyautey, Poto-Poto, Poto-Poto (arrondissement 3), Brazzaville (commune), Brazzaville (département) | absent | https://www.openstreetmap.org/node/5504990534 |
| congo_brazzaville | Pointe-Noire | Pointe-Noire | Clinique churgico du plateaux, 055712331, Avenue François Charles, Losange, Pointe-Noire, Lumumba (arrondissement 1) | 4389 | https://www.openstreetmap.org/node/6871271752 |
| congo_brazzaville | Niari | Dolisie | BGFI Bank, Rue Antonnetti, Centre-ville, Dolisie, Niari, Congo | absent | https://www.openstreetmap.org/node/4581988891 |
| congo_brazzaville | Cuvette | Owando | Hotel de l'Eglise, RN 2, Ombele, Owando, Cuvette, Congo | absent | https://www.openstreetmap.org/node/3323401945 |
| congo_kinshasa | Kinshasa | Kinshasa | Joliparc Hotel & spa, 5, Avenue haute tension, Binza Météo, Congo, Ngaliema | 00243 | https://www.openstreetmap.org/way/665085797 |
| congo_kinshasa | Haut-Katanga | Lubumbashi | Poste de Lubumbashi, Avenue Jason Sendwe, Luvua, Makutano, Lubumbashi, Ville de Lubumbashi | absent | https://www.openstreetmap.org/node/4273069990 |
| congo_kinshasa | Nord-Kivu | Goma | HÔTEL aux 2 Paysages, 234, Avenue du lac, Himbi, Goma, Nord-Kivu | 0600 | https://www.openstreetmap.org/way/997487634 |
| congo_kinshasa | Sud-Kivu | Bukavu | TMB BANK, Avenue Patrice Emery Lumumba, Ibanda, Bukavu, Sud-Kivu, 00243 | 00243 | https://www.openstreetmap.org/node/13901980291 |
| cote_divoire | Abidjan | Abidjan | Bureau de poste, Boulevard de la République, Le Plateau, Abidjan, Côte d’Ivoire | absent | https://www.openstreetmap.org/node/1932547198 |
| cote_divoire | Abidjan | Yopougon | Hôtel, Rue P20, Score, Attié, Yopougon, Abidjan | absent | https://www.openstreetmap.org/node/5928588893 |
| cote_divoire | Lacs | Yamoussoukro | Centre Hospitalier Régional de Yamoussoukro, Avenue Félix Houphouët-Boigny, Energie, Yamoussoukro, Côte d’Ivoire | absent | https://www.openstreetmap.org/way/94224466 |
| cote_divoire | Savanes | Korhogo | Afriland First Bank, Boulevard Alassane Ouattara, Koko, Korhogo, Poro, Savanes | absent | https://www.openstreetmap.org/node/11120967821 |
| equatorial_guinea | Bioko Norte | Malabo | Hotel Tropicana, Avenida Hasán II, Los Ángeles, Santa Isabel, Malabo, Distrito de Malabo | absent | https://www.openstreetmap.org/node/2914015325 |
| equatorial_guinea | Litoral | Bata | Aeropuerto Internacional de Bata, Carretera del Aeropuerto, Bata, Litoral, Región Continental, Guinea Ecuatorial | absent | https://www.openstreetmap.org/relation/12373140 |
| equatorial_guinea | Centro Sur | Evinayong | Evinayong, Centro Sur, Región Continental, Guinea Ecuatorial | absent | https://www.openstreetmap.org/relation/12718869 |
| equatorial_guinea | Wele-Nzas | Mongomo | Aeropuerto de Mongomo, Carretera Ebebiyin - Mongomo, Mongomo, Wele-Nzas, Región Continental, Guinea Ecuatorial | absent | https://www.openstreetmap.org/node/6543791066 |
| eswatini | Hhohho | Mbabane | Central Bank of Swaziland, Mahlokohla Street, Mbabane, Inkhundla Mbabane, Hhohho, H100 | H100 | https://www.openstreetmap.org/node/848603772 |
| eswatini | Hhohho | Lobamba | Happy Valley Hotel, Mpumalanga Drive, Lobamba, Inkhundla Lobamba, Hhohho, Eswatini | absent | https://www.openstreetmap.org/node/2615899374 |
| eswatini | Manzini | Manzini | First National Bank ATM, Ngwane Street, Manzini, Inkhundla Manzini, Manzini, M100 | M100 | https://www.openstreetmap.org/node/2614887997 |
| eswatini | Manzini | Matsapha | First National Bank, Matalatala Avenue, Matsapha Industrial Site, Matsapha, Inkhundla Kwaluseni, Manzini | M202 | https://www.openstreetmap.org/node/1401273881 |
| eswatini | Lubombo | Siteki | Siteki hotel, D12, Nilshasane, Inkhundla Lugongolweni, Lubombo, L300 | L300 | https://www.openstreetmap.org/node/3394152167 |
| ethiopia | Addis Ababa | Addis Ababa | Zewditu Memorial Hospital ዘውዲቱ መታሰቢያ ሆስፒታል, Wendimeneh Street, ብሔራዊ, Kirkos, አዲስ አበባ Addis Ababa أديس أبابا, አዲስ አበባ أديس أبابا | 1138 | https://www.openstreetmap.org/way/50833502 |
| ethiopia | Dire Dawa | Dire Dawa | ፈረንሳይ ሆስፒታል, Before Station Road, የ'ሰላም አዳራሽ መንጊስት, Dirree Dhawaa / Dir Dhabe / ድሬዳዋ, ኢትዮጵያ | absent | https://www.openstreetmap.org/way/787549806 |
| ethiopia | Amhara | Bahir Dar | Bank of Abyssinia Bahirdar Branch, A3, ሻምቡ አካባቢ, ሳር መንደር, Bahir Dar, አማራ ክልል | 6600 | https://www.openstreetmap.org/node/4720178594 |
| ethiopia | Tigray | Mekelle | Dashen bank, Selam Street, Maqale, Mekelle, ትግራይ تجراى, 1547 | 1547 | https://www.openstreetmap.org/node/4972403029 |
| gabon | Estuaire | Libreville | United Bank for Africa, Boulevard Triomphal Omar Bongo Ondimba, Louis, Vallée Sainte-Marie, 3ème Arrondissement, Libreville | 12035 | https://www.openstreetmap.org/way/373247369 |
| gabon | Ogooue-Maritime | Port-Gentil | Hôtel L'Hirondelle, Boulevard du Gouverneur Pelieu, Rombintchozo, Port-Gentil, Bendje, Ogooué-Maritime | absent | https://www.openstreetmap.org/way/1147682534 |
| gabon | Haut-Ogooue | Franceville | Hotel Masuku, Route Economique, Wendze, Franceville, Mpassa, Haut-Ogooué | absent | https://www.openstreetmap.org/node/4621927197 |
| gabon | Nyanga | Tchibanga | Le Relais Nyanga, RP501, Tchibanga, Mougoutsi, Nyanga, Gabon | absent | https://www.openstreetmap.org/way/1225749694 |
| gambia | Banjul | Banjul | Edward Francis Small Teaching Hospital, Anne-Marie Javouhey Street, Banjul, Gambia | absent | https://www.openstreetmap.org/way/249740590 |
| gambia | Kanifing | Serekunda | Trust Bank, Sayerjobe Avenue, Bartez, Serrekunda, Kanifing, Gambia | absent | https://www.openstreetmap.org/way/435697479 |
| gambia | Kanifing | Bakau | Trust Bank, Sait Matty Road, Old Bakau, Bakau New Town and Fajara, Serrekunda, Kanifing | absent | https://www.openstreetmap.org/node/326327325 |
| gambia | West Coast | Brikama | University Library, South Bank Road, Faraba Sutu, Kafuta, Kombo East, Brikama | absent | https://www.openstreetmap.org/way/1299545034 |
| generic_intl | Not specified | London | The Ritz London, 150, Piccadilly, St. James's, Mayfair, City of Westminster | W1J 9BR | https://www.openstreetmap.org/way/26706806 |
| generic_intl | Not specified | Manchester | Ladybarn Lane Post Office, 124, Ladybarn Lane, Ladybarn, Fallowfield, Manchester | M14 6YH | https://www.openstreetmap.org/node/9254794260 |
| generic_intl | Not specified | Birmingham | Coleshill Road Post Office, Fox and Goose Shopping Centre, Birmingham, West Midlands, England, B8 2EP | B8 2EP | https://www.openstreetmap.org/way/175421197 |
| georgia | Tbilisi | Tbilisi | თიბისი ბანკი, გიორგი ლეონიძის ქუჩა, მთაწმინდა, სოლოლაკი, მთაწმინდის რაიონი, თბილისი | 0108 | https://www.openstreetmap.org/node/9668019035 |
| georgia | Adjara | Batumi | ბათუმის ხელოვნების სასწავლი უნივერსიტეტი, 32, ვაჟა-ფშაველას ქუჩა, ძველი ბათუმი, ბათუმი, აჭარის ავტონომიური რესპუბლიკა | 6000 | https://www.openstreetmap.org/way/932756389 |
| georgia | Imereti | Kutaisi | საქართველოს ბანკი, 37, ილია ჭავჭავაძის გამზირი, სულხან-საბა, ქუთაისი, იმერეთი | 4600 | https://www.openstreetmap.org/node/10910659760 |
| georgia | Kakheti | Telavi | თელავის მუნიციპალიტეტის მერია, ერეკლე მეორის ქუჩა, თელავი, თელავის მუნიციპალიტეტი, კახეთი, 2200 | 2200 | https://www.openstreetmap.org/way/532031051 |
| ghana | Greater Accra | Accra | Accra Metropolitan Assembly, Independence Avenue, Ridge, Accra Central, Accra, Korle-Klottey Municipal District | GA143 | https://www.openstreetmap.org/way/613271739 |
| ghana | Greater Accra | Tema | Tema Community 7 Post Office, Prono Street, Community 7, Tema, Tema Metropolitan District, Greater Accra Region | GT045 | https://www.openstreetmap.org/node/7170575985 |
| ghana | Ashanti | Kumasi | Bank of Ghana, Asratoase Street, Adum, Kumasi, Kumasi Metropolitan District, Ashanti Region | AK-010-1295 | https://www.openstreetmap.org/way/571757260 |
| ghana | Ashanti | Obuasi | Obuasi Post Office, Ofori Agyeman II Street, A.G.A, Obuasi, Obuasi Municipal District, Ashanti Region | AO028 | https://www.openstreetmap.org/node/2159242273 |
| ghana | Northern | Tamale | Access Bank, Bank Street, Tishigu Town, Tamale, Tamale Metropolitan District, Northern Region | NT-0148-3057 | https://www.openstreetmap.org/node/1791490402 |
| guinea | Conakry | Conakry | Afriland First Bank, Boulevard de la Nation, Coronthie 1, Kaloum, Conakry, 258 | 258 | https://www.openstreetmap.org/way/441774562 |
| guinea | Kankan | Kankan | Aéroport de Kankan, N6, ߝߎ߬ߛߋ߲߬, Kankan, Karfamoriah, Préfecture de Kankan | absent | https://www.openstreetmap.org/node/2598227769 |
| guinea | Nzerekore | Nzerekore | Hotel de Africa, N'zérékoré-Macenta, Kélémadiou, Nzérékoré, Guinée | absent | https://www.openstreetmap.org/node/6002368587 |
| guinea | Kindia | Kindia | Hotel Masabi, N1, Foulaya, Damakania, Préfecture de Kindia, Kindia | absent | https://www.openstreetmap.org/node/5210953723 |
| guinea_bissau | Bissau | Bissau | Hotel Império, Avenida Amilcar Cabral, Tchada, Reino, Bissau, Sector autónomo de Bissau | 1021 | https://www.openstreetmap.org/way/130542951 |
| guinea_bissau | Gabu | Gabu | HOTEL VISIOM, N1;N4, Gabu, Sector de Gabu, Região de Gabu, Província Leste | absent | https://www.openstreetmap.org/node/2818619884 |
| guinea_bissau | Bafata | Bafata | Hospital de Bafatá, Avenida Principal, Bafatá, Sector de Bafatá, Região de Bafatá, Província Leste | absent | https://www.openstreetmap.org/way/601314145 |
| guinea_bissau | Cacheu | Cacheu | Delta Hotel, R1, Cacheu, Sector de Cacheu, Região de Cacheu, Província Norte | absent | https://www.openstreetmap.org/node/11288671069 |
| guinea_conakry | Conakry | Conakry | Afriland First Bank, Boulevard de la Nation, Coronthie 1, Kaloum, Conakry, 258 | 258 | https://www.openstreetmap.org/way/441774562 |
| guinea_conakry | Kindia | Kindia | Hotel Masabi, N1, Foulaya, Damakania, Préfecture de Kindia, Kindia | absent | https://www.openstreetmap.org/node/5210953723 |
| guinea_conakry | Boke | Boke | Sangarédi Airport, Sangarédi, Préfecture de Boké, Boké, Guinée | absent | https://www.openstreetmap.org/node/462742418 |
| guinea_conakry | Mamou | Mamou | Post Office of Dalaba, N5, Dalaba, Préfecture de Dalaba, Mamou, Guinée | absent | https://www.openstreetmap.org/node/9482088444 |
| ireland | County Dublin | Dublin | Hotel RIU Plaza The Gresham Dublin, 23, O'Connell Street Upper, North City Ward 1986, Dublin, County Dublin | D01 C3W7 | https://www.openstreetmap.org/way/316971224 |
| ireland | County Cork | Cork | Premier Inn Cork City Centre Hotel, 11, Morrison's Quay, Morrison's Island, Centre A ED, Cork | T12 PF78 | https://www.openstreetmap.org/way/1304929937 |
| ireland | County Galway | Galway | Galway City Hostel, Frenchville Lane, Eyre Square, Cathair na Gaillimhe, County Galway, Connacht | H91 W862 | https://www.openstreetmap.org/node/450249853 |
| kazakhstan | Almaty | Almaty | Алматы Энергетика және Байланыс Университетi, Байтұрсынұлы көшесі, Көктем, Бостандық ауданы, Алматы, 050013 | 050013 | https://www.openstreetmap.org/way/286610625 |
| kazakhstan | Astana | Astana | Astana IT University, С1, Мәңгілік Ел даңғылы, Есіл ауданы, Астана, Z05P1P8 | Z05P1P8 | https://www.openstreetmap.org/node/10575843769 |
| kazakhstan | Shymkent | Shymkent | City Hotel, 4, Республика даңғылы, Абай ауданы, Шымкент, 160018 | 160018 | https://www.openstreetmap.org/node/6604845802 |
| kenya | Nairobi County | Nairobi | Nairobi General Post Office, Kenyatta Avenue, City Square sublocation, Starehe location, CBD division, Starehe | 00100 | https://www.openstreetmap.org/node/1537504486 |
| kenya | Mombasa County | Mombasa | Jambo Paradise Hotel - Mombasa, Tana Street, Saba Saba, Tononoka, Mombasa, Tononoka ward | 80112 | https://www.openstreetmap.org/node/6054561497 |
| kenya | Kisumu County | Kisumu | University of Nairobi Kisumu Campus, Oginga Odinga Street, Lower Railways, Milimani, Southern sublocation, Kisumu Central | 40141 | https://www.openstreetmap.org/way/1172998264 |
| lesotho | Maseru | Maseru | Victoria Hotel, Kingsway, Qhobosheane Government Complex, Maseru Central, Maseru, Maseru District | 100 | https://www.openstreetmap.org/node/4482888294 |
| lesotho | Leribe | Hlotse | Standard Lesotho Bank, Hlotse Main Street, Ha Letlatsa (Tsifa-Limali), Lisemeng (Hlotse), Hlotse, Leribe District | 300 | https://www.openstreetmap.org/node/5856832585 |
| liberia | Montserrado | Monrovia | JF Kennedy Medical Center Hospital, 24th, 24th Street, Behind JFK, Sinkor, Monrovia | 1000 | https://www.openstreetmap.org/way/94957267 |
| liberia | Nimba | Ganta | F-2 Hotel, Palala - Ganta, Congo, Zone 4, Garr-Bain, Nimba County | absent | https://www.openstreetmap.org/node/4889611412 |
| malawi | Southern Region | Blantyre | Reserve Bank, Hannover Avenue, Mbayani, Blantyre, Southern Region, Malawi | absent | https://www.openstreetmap.org/way/279173224 |
| malawi | Southern Region | Zomba | University of Malawi - Chancellor College Campus, abu jabel, Zomba, Southern Region, 280, Malawi | 280 | https://www.openstreetmap.org/way/540539479 |
| malawi | Central Region | Lilongwe | Presidential Hotel, Presidential Way, Lilongwe, Central Region, +265, Malawi | +265 | https://www.openstreetmap.org/way/910134203 |
| malawi | Central Region | Dedza | Dedza Pottery Lodge, M1, Dedza, Central Region, Malawi | absent | https://www.openstreetmap.org/node/902447577 |
| malawi | Northern Region | Mzuzu | FMB Bank, Glyn Jones Road, Mzuzu, Mzimba, Northern Region, Malawi | absent | https://www.openstreetmap.org/way/237991246 |
| mali | Bamako | Bamako | La Poste - Bureau de Bamako Darsalam, Avenue de la Liberté, Dravéla, Dar Salam, Médina Coura, Bamako | absent | https://www.openstreetmap.org/way/422727616 |
| mali | Sikasso | Sikasso | Aéroport de Bougouni, Route Trans-Sahélienne, Bougouni, Cercle de Bougouni, Région de Sikasso, Mali | absent | https://www.openstreetmap.org/node/1042040844 |
| mauritius | Port Louis | Port Louis | BCPBM Port Louis Business Centre, Duke of Edinburgh Street, Centre-Ville, Barracks, Town of Port-Louis, Ward 3 | 11307 | https://www.openstreetmap.org/node/4875709575 |
| mauritius | Plaines Wilhems | Curepipe | Mauritius Commercial Bank, Rue Ferriere, La Vigie, Town of Curepipe, Ward 4, West | 74513 | https://www.openstreetmap.org/way/223523810 |
| mozambique | Maputo | Maputo | Hotel, Av. Karl Marx, Central "C", Distrito Municipal de KaMpfumu, Cidade de Maputo, Zona Sul | 0101-03 | https://www.openstreetmap.org/node/931240306 |
| mozambique | Nampula | Nampula | Hospital Geral de Nampula, N13, Nampula, Cidade de Nampula, Nampula, Zona Norte | absent | https://www.openstreetmap.org/way/834066701 |
| namibia | Khomas | Windhoek | Hotel Steiner, 11, Wecke Street, Windhoek Central, Windhoek, Khomas Region | 10005 | https://www.openstreetmap.org/way/390949455 |
| namibia | Erongo | Walvis Bay | Bank Windhoek, Rikumbi Kandanga Road, Walvis Bay, Erongo Region, 13013, Namibia | 13013 | https://www.openstreetmap.org/node/2517228191 |
| niger | Niamey | Niamey | Bravia Hotel, Rue PL - 23, Château 1, Plateau, Arrondissement Communal Niamey 1, Niamey | 8001 | https://www.openstreetmap.org/node/6759191628 |
| niger | Maradi | Maradi | DAN BOUZOU Hospital, Dan Bouzou, Aguié, Maradi, 4000, Niger | 4000 | https://www.openstreetmap.org/way/524039035 |
| nigeria | Lagos | Lagos | Lagos City Hall, Catholic Mission Street, Lagos, Lagos Island, Lagos, 100242 | 100242 | https://www.openstreetmap.org/relation/7774249 |
| nigeria | Lagos | Ikeja | Lagos State University Teaching Hospital, Simbiat Abiola Road, Ikeja, Lagos, 100282, Nigeria | 100282 | https://www.openstreetmap.org/way/704991085 |
| nigeria | Federal Capital Territory | Abuja | Sheraton Abuja Hotel, Ladi Kwali Street, Wuse, Abuja, Municipal Area Council, Federal Capital Territory | 900001 | https://www.openstreetmap.org/relation/12194914 |
| nigeria | Rivers | Port Harcourt | Braithwaite Memorial Hospital, Port Harcourt - Aba Expressway, Old GRA, Port-Harcourt, Rivers, 520052 | 520052 | https://www.openstreetmap.org/way/756560005 |
| rwanda | Kigali City | Kigali | BANK 🏦, bank, KG 109 Street, Gasabo District, City of Kigali, Rwanda | absent | https://www.openstreetmap.org/node/10840168352 |
| rwanda | Northern Province | Musanze | SHASTE CITY HOTEL, NR2, Muhoza, Musanze District, Northern Province, 00000 | 00000 | https://www.openstreetmap.org/node/13041461018 |
| senegal | Dakar | Dakar | keur  aminata hotel dakar, Rue FA-47, Fass Delorme, Commune de Gueule Tapée-Fass-Colobane, Arrondissement de Dakar-Plateau, Dakar | 13500 | https://www.openstreetmap.org/node/11268758870 |
| senegal | Dakar | Pikine | IPRES Pikine, Tally Bou Mack, Commune de Pikine Ouest, Commune de Pikine Nord, Arrondissement de Pikine-Dagoudane, Département de Pikine | 14000 | https://www.openstreetmap.org/node/6263750009 |
| senegal | Thies | Thies | Hôtel de ville de Thiès, N 3, Thiès, Commune de Thiès Est, Arrondissement de Thiès Sud, Département de Thiès | 20001 | https://www.openstreetmap.org/way/167707923 |
| senegal | Diourbel | Touba | SGBS Touba, N 3, Ndame, Touba, Communauté rurale de Touba Mosquée, Arrondissement de Ndame | 22100 | https://www.openstreetmap.org/node/5242327184 |
| sierra_leone | Western Area | Freetown | Kona Lodge Hotel, King Street, Wilberforce, Freetown, Western Area Urban, Western Area | absent | https://www.openstreetmap.org/way/306327139 |
| sierra_leone | Eastern Province | Kenema | GT Bank, Hangha Road, Ida, Kenema, Kenema District, Eastern Province | absent | https://www.openstreetmap.org/node/6436227885 |
| sierra_leone | Eastern Province | Koidu | D&S Hotel, Main Kaindordu Road, Kinse, Koidu, Kono District, Eastern Province | absent | https://www.openstreetmap.org/node/988037708 |
| sierra_leone | Northern Province | Makeni | University of Sierra  Leone  Administrative Building, kamakwe highway, Mafonike, Makeni, Bombali District, Northern Province | 00232 | https://www.openstreetmap.org/way/308904321 |
| south_africa | Gauteng | Johannesburg | Rissik St Post Office, Rissik Street, Newtown, Johannesburg Ward 60, Johannesburg, City of Johannesburg Metropolitan Municipality | 2001 | https://www.openstreetmap.org/way/416130593 |
| south_africa | Gauteng | Pretoria | PostNet Pretoria CBD, Francis Baard Street, Tshwane Ward 58, Pretoria, City of Tshwane Metropolitan Municipality, Gauteng | 0002 | https://www.openstreetmap.org/node/8061837564 |
| south_africa | Western Cape | Cape Town | SunSquare Cape Town Gardens, 10, Mill Street, Gardens, Cape Town, City of Cape Town | 8001 | https://www.openstreetmap.org/way/131399664 |
| south_sudan | Central Equatoria | Juba | Police Hospital, University Road, Hai Soura, Juba, Hai Buluk, Juba | absent | https://www.openstreetmap.org/way/320444443 |
| south_sudan | Upper Nile | Malakal | Upper Nile University, Nyikango Road, Malakal, Makal Shilluk Island, Malakal, Upper Nile أعالى النيل | absent | https://www.openstreetmap.org/way/218575490 |
| swaziland | Hhohho | Mbabane | Central Bank of Swaziland, Mahlokohla Street, Mbabane, Inkhundla Mbabane, Hhohho, H100 | H100 | https://www.openstreetmap.org/node/848603772 |
| swaziland | Hhohho | Pigg's Peak | PIGG'S PEAK CENTRAL HIGH, King Mswati II Highway, Piggs Peak, Inkhundla Piggs Peak, Hhohho, Eswatini | absent | https://www.openstreetmap.org/node/13316867981 |
| swaziland | Manzini | Manzini | First National Bank ATM, Ngwane Street, Manzini, Inkhundla Manzini, Manzini, M100 | M100 | https://www.openstreetmap.org/node/2614887997 |
| tanzania | Dar es Salaam | Dar es Salaam | City Hall [9], Morogoro Road, Mchafukoge, Ilala Municipal, Dar es Salaam, Coastal Zone | 11107 | https://www.openstreetmap.org/node/4303477590 |
| tanzania | Arusha | Arusha | Arusha Central Post Office, Boma Avenue, Arusha, Arusha Municipal, Arusha, Northern Zone | 23101 | https://www.openstreetmap.org/way/317673669 |
| tanzania | Mwanza | Mwanza | open University of Tanzania, Kenyatta Road, Mwanza, Nyamagana, Mwanza, Lake Zone | 33214 | https://www.openstreetmap.org/node/4399780690 |
| togo | Maritime | Lome | BCEAO LOME, Avenue Abdoulaye Fadiga, Quartier Administratif, 1er Arrondissement, Lomé, Région Maritime | absent | https://www.openstreetmap.org/way/653607682 |
| togo | Maritime | Aneho | Société des Postes Aneho, Lomé - Cotonou Transafrican Highway, Zone 2, Région Maritime, Togo | absent | https://www.openstreetmap.org/node/2454830074 |
| togo | Plateaux | Kpalime | hotel djim, Rue du Commerce, Kpalime, Gakpodzi, Fiakome, Kpalimé | absent | https://www.openstreetmap.org/node/5988813298 |
| togo | Plateaux | Atakpame | CHR Atakpame, Avenue de la Libération, Houdou, Atakpamé, Région des Plateaux, Togo | absent | https://www.openstreetmap.org/node/10830716947 |
| togo | Kara | Kara | Hotel Kara, Avenue du 23 Septembre, Kara, Kozah, Région de la Kara, Togo | absent | https://www.openstreetmap.org/node/11158622407 |
| uganda | Central Region | Kampala | Kampala Club Hotel Shangri-la, Sezibwa Road, Nakasero, Central, Kampala Capital City, Kampala | absent | https://www.openstreetmap.org/node/773119927 |
| uganda | Central Region | Entebbe | Entebbe Hospital Private Patient Services, Kampala Road, Entebbe Central Police Quaters/ Residence, Namate, Post Office Subward, Lunyo Eastlunyo East | absent | https://www.openstreetmap.org/way/377707157 |
| uganda | Eastern Region | Jinja | Kakira Post Office, To Madhvani Factory, Bungalow, Jinja, Eastern Region, Uganda | absent | https://www.openstreetmap.org/way/283565254 |
| uganda | Eastern Region | Mbale | Crown Suites Hotel, Bungokho Road, Nabijjo, Mbale City, Bugisa sub-region, Eastern Region | PO Box 462 | https://www.openstreetmap.org/node/4475305145 |
| uzbekistan | Tashkent City | Tashkent | Банк, Mustaqillik shoh ko'chasi, Buyuk Ipak Yo'li (C-1) dahasi, Mirzo Ulug‘bek Tumani, Toshkent shahri, 100000 | 100000 | https://www.openstreetmap.org/way/105437570 |
| uzbekistan | Samarkand Region | Samarkand | Hotel Asia Samarkand, Qo'sh Hovuz ko'chasi, Samarqand shahri, Samarqand Viloyati, 140000, Oʻzbekiston | 140000 | https://www.openstreetmap.org/way/412938002 |
| uzbekistan | Bukhara Region | Bukhara | Asia Alliance Bank, Bahovaddin Naqshband ko'chasi, Eski Shahar, Buxoro shahri, Buxoro Viloyati, 200118 | 200118 | https://www.openstreetmap.org/node/6185636786 |
| western_sahara | Laayoune-Sakia El Hamra | Laayoune | Laayoune, Laayoune-Sakia El Hamra, Western Sahara | absent | https://www.openstreetmap.org/ |
| western_sahara | Dakhla-Oued Ed-Dahab | Dakhla | Bureau de Poste de Dakhla, Avenue Imlili, Dakhla, Pachalik de Dakhla | 73002 | https://www.openstreetmap.org/node/2907752099 |
| zambia | Lusaka Province | Lusaka | Central Post Office, Cairo Road, Luneta, Lusaka, Lusaka District, Lusaka Province | 10101 | https://www.openstreetmap.org/way/609305228 |
| zambia | Lusaka Province | Kafue | CJ Nyirenda Hospital, Kafue Road, Makeni, Lusaka, Lusaka District, Lusaka Province | 10101 | https://www.openstreetmap.org/way/1245533281 |
| zambia | Copperbelt Province | Ndola | Northern Command Military Hospital, Plot 8175, Hammarskjoeld Drive, Itawa, Ndola, Ndola District | 10101 | https://www.openstreetmap.org/node/4195191381 |
| zambia | Copperbelt Province | Kitwe | Absa Bank, Matuka Avenue, Cha Cha Cha, Kitwe, Kitwe District, Copperbelt Province | 1001 | https://www.openstreetmap.org/way/432709329 |
| zambia | Southern Province | Livingstone | Livingstone Backpackers, 559, Mokambo Road, Maramba, Livingstone, Livingstone District | absent | https://www.openstreetmap.org/way/370992417 |
| zimbabwe | Harare | Harare | Zimbabwe Open University Harare Campus, Julius Nyerere Way, Braeside, Harare, Harare Province, 00000 | 00000 | https://www.openstreetmap.org/node/8841763817 |
| zimbabwe | Bulawayo | Bulawayo | Mpilo central Hospital, Ngazimbi Road, Barbour Fields, Nguboyenja, Mzilikazi, Bulawayo | absent | https://www.openstreetmap.org/way/461688230 |
| zimbabwe | Midlands | Gweru | Catholic University of Zimbabwe, Lobengula Avenue, Southdown, Gweru, Midlands, Zimbabwe | absent | https://www.openstreetmap.org/node/10959029754 |
