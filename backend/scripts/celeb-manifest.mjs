/**
 * The celebrity list for the "Celeb Close-Up" game.
 *
 * Each entry needs a Wikipedia page title. The build script downloads the
 * page's lead portrait from Wikimedia Commons, auto-detects the face and cuts
 * the four feature crops (eyes / nose / lips / hair) plus a reveal portrait.
 *
 * `search` is only needed when the Wikipedia page title is ambiguous on
 * Commons. `override` can point at a specific Commons file when the automatic
 * pick is wrong; it is intentionally empty in the checked-in list so a rebuild
 * stays reproducible.
 *
 * License + author are captured from Commons at build time and written to
 * public/celebrities/celeb-closeup/ATTRIBUTION.md.
 */
export const CELEBRITIES = [
  // --- Bollywood men -------------------------------------------------------
  { slug: "shah-rukh-khan", name: "Shah Rukh Khan", page: "Shah Rukh Khan", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "salman-khan", name: "Salman Khan", page: "Salman Khan", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "aamir-khan", name: "Aamir Khan", page: "Aamir Khan", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "amitabh-bachchan", name: "Amitabh Bachchan", page: "Amitabh Bachchan", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "akshay-kumar", name: "Akshay Kumar", page: "Akshay Kumar", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "ajay-devgn", name: "Ajay Devgn", page: "Ajay Devgn", override: "File:Ajay Devgn at 'Action Jackson' photoshoot.jpg", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "hrithik-roshan", name: "Hrithik Roshan", page: "Hrithik Roshan", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "ranbir-kapoor", name: "Ranbir Kapoor", page: "Ranbir Kapoor", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "ranveer-singh", name: "Ranveer Singh", page: "Ranveer Singh", gender: "m", region: "bollywood", difficulty: "easy" },
  { slug: "saif-ali-khan", name: "Saif Ali Khan", page: "Saif Ali Khan", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "anil-kapoor", name: "Anil Kapoor", page: "Anil Kapoor", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "sanjay-dutt", name: "Sanjay Dutt", page: "Sanjay Dutt", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "john-abraham", name: "John Abraham", page: "John Abraham", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "kartik-aaryan", name: "Kartik Aaryan", page: "Kartik Aaryan", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "ayushmann-khurrana", name: "Ayushmann Khurrana", page: "Ayushmann Khurrana", gender: "m", region: "bollywood", difficulty: "medium" },
  { slug: "nawazuddin-siddiqui", name: "Nawazuddin Siddiqui", page: "Nawazuddin Siddiqui", gender: "m", region: "bollywood", difficulty: "medium" },

  // --- Bollywood women -----------------------------------------------------
  { slug: "deepika-padukone", name: "Deepika Padukone", page: "Deepika Padukone", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "priyanka-chopra", name: "Priyanka Chopra", page: "Priyanka Chopra", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "alia-bhatt", name: "Alia Bhatt", page: "Alia Bhatt", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "aishwarya-rai", name: "Aishwarya Rai", page: "Aishwarya Rai", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "kareena-kapoor", name: "Kareena Kapoor", page: "Kareena Kapoor", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "katrina-kaif", name: "Katrina Kaif", page: "Katrina Kaif", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "anushka-sharma", name: "Anushka Sharma", page: "Anushka Sharma", gender: "f", region: "bollywood", difficulty: "medium" },
  { slug: "madhuri-dixit", name: "Madhuri Dixit", page: "Madhuri Dixit", gender: "f", region: "bollywood", difficulty: "easy" },
  { slug: "kajol", name: "Kajol", page: "Kajol", gender: "f", region: "bollywood", difficulty: "medium" },
  { slug: "vidya-balan", name: "Vidya Balan", page: "Vidya Balan", gender: "f", region: "bollywood", difficulty: "medium" },
  { slug: "shraddha-kapoor", name: "Shraddha Kapoor", page: "Shraddha Kapoor", gender: "f", region: "bollywood", difficulty: "medium" },
  { slug: "kriti-sanon", name: "Kriti Sanon", page: "Kriti Sanon", gender: "f", region: "bollywood", difficulty: "medium" },
  { slug: "kiara-advani", name: "Kiara Advani", page: "Kiara Advani", gender: "f", region: "bollywood", difficulty: "medium" },

  // --- South cinema --------------------------------------------------------
  { slug: "rajinikanth", name: "Rajinikanth", page: "Rajinikanth", gender: "m", region: "south", difficulty: "easy" },
  { slug: "kamal-haasan", name: "Kamal Haasan", page: "Kamal Haasan", gender: "m", region: "south", difficulty: "medium" },
  { slug: "prabhas", name: "Prabhas", page: "Prabhas", gender: "m", region: "south", difficulty: "easy" },
  { slug: "allu-arjun", name: "Allu Arjun", page: "Allu Arjun", gender: "m", region: "south", difficulty: "easy" },
  { slug: "ram-charan", name: "Ram Charan", page: "Ram Charan", gender: "m", region: "south", difficulty: "medium" },
  { slug: "vijay", name: "Vijay", page: "Vijay (actor)", search: "C. Joseph Vijay", gender: "m", region: "south", difficulty: "medium" },
  { slug: "dhanush", name: "Dhanush", page: "Dhanush", gender: "m", region: "south", difficulty: "medium" },
  { slug: "suriya", name: "Suriya", page: "Suriya", gender: "m", region: "south", difficulty: "medium" },
  { slug: "mohanlal", name: "Mohanlal", page: "Mohanlal", gender: "m", region: "south", difficulty: "medium" },
  { slug: "mammootty", name: "Mammootty", page: "Mammootty", gender: "m", region: "south", difficulty: "medium" },
  { slug: "dulquer-salmaan", name: "Dulquer Salmaan", page: "Dulquer Salmaan", gender: "m", region: "south", difficulty: "medium" },
  { slug: "mahesh-babu", name: "Mahesh Babu", page: "Mahesh Babu", gender: "m", region: "south", difficulty: "medium" },
  { slug: "nayanthara", name: "Nayanthara", page: "Nayanthara", search: "Nayanthara actress", gender: "f", region: "south", difficulty: "medium" },
  { slug: "samantha-ruth-prabhu", name: "Samantha Ruth Prabhu", page: "Samantha Ruth Prabhu", gender: "f", region: "south", difficulty: "medium" },
  { slug: "rashmika-mandanna", name: "Rashmika Mandanna", page: "Rashmika Mandanna", gender: "f", region: "south", difficulty: "easy" },
  { slug: "tamannaah", name: "Tamannaah Bhatia", page: "Tamannaah", gender: "f", region: "south", difficulty: "medium" },
  { slug: "trisha", name: "Trisha Krishnan", page: "Trisha (actress)", gender: "f", region: "south", difficulty: "medium" },
  { slug: "sai-pallavi", name: "Sai Pallavi", page: "Sai Pallavi", gender: "f", region: "south", difficulty: "medium" },
];
